from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.database import engine, SessionLocal
from app.life_domains import migrate_life_domains_to_global
from app.models import Base, User, SystemPrompt, AccessCode, CompanionSettings, TreatmentProgress, PhaseConfig
from app.routers import records, stats, activities, chatbot, auth, supporters, audio, assessments, billing
from app.prompts import (
    SAFETY_CHECK_SYSTEM,
    STRUCTURED_EXTRACTION_SYSTEM,
    EMPATHIC_FEEDBACK_SYSTEM,
    CHATBOT_CORE_PROMPT,
)


def _migrate():
    """Add missing columns to existing tables (safe to run multiple times)."""
    # Use IF NOT EXISTS so each statement is idempotent (PostgreSQL 9.6+)
    migrations = [
        "ALTER TABLE mood_records ADD COLUMN IF NOT EXISTS pleasure_score REAL",
        "ALTER TABLE mood_records ADD COLUMN IF NOT EXISTS importance_score REAL",
        "ALTER TABLE mood_records ADD COLUMN IF NOT EXISTS planned_activity_id TEXT",
        "ALTER TABLE mood_records ADD COLUMN IF NOT EXISTS life_domain_id TEXT",
        "ALTER TABLE companion_settings ADD COLUMN IF NOT EXISTS user_summary TEXT",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception:
                pass  # SQLite doesn't support IF NOT EXISTS — ignore
        conn.commit()

    inspector = inspect(engine)
    if "phase_config" in inspector.get_table_names():
        columns = {col["name"] for col in inspector.get_columns("phase_config")}
        missing_bool_columns = [
            column
            for column in (
                "intro_require_tasks",
                "setup_require_tasks",
                "first_review_require_tasks",
                "manual_advance_enabled",
                "time_requirements_disabled_once",
            )
            if column not in columns
        ]
        if missing_bool_columns:
            with engine.begin() as conn:
                for column in missing_bool_columns:
                    conn.execute(text(
                        f"ALTER TABLE phase_config "
                        f"ADD COLUMN {column} BOOLEAN DEFAULT "
                        f"{'FALSE' if column == 'time_requirements_disabled_once' else 'TRUE'}"
                    ))
        inspector = inspect(engine)
        columns = {col["name"] for col in inspector.get_columns("phase_config")}
        if "time_requirements_disabled_once" in columns:
            with engine.begin() as conn:
                conn.execute(text(
                    "UPDATE phase_config SET "
                    "intro_time_limit = FALSE, "
                    "setup_time_limit = FALSE, "
                    "first_review_time_limit = FALSE, "
                    "time_requirements_disabled_once = TRUE "
                    "WHERE time_requirements_disabled_once IS FALSE "
                    "OR time_requirements_disabled_once IS NULL"
                ))

    inspector = inspect(engine)
    if "users" in inspector.get_table_names():
        columns = {col["name"] for col in inspector.get_columns("users")}
        user_migrations = [
            ("plan_type", "VARCHAR DEFAULT 'free'"),
            ("premium_until", "TIMESTAMP"),
            ("entitlement_source", "VARCHAR"),
            ("revenuecat_app_user_id", "VARCHAR"),
            ("language", "VARCHAR DEFAULT 'zh'"),
        ]
        with engine.begin() as conn:
            for column, definition in user_migrations:
                if column not in columns:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {column} {definition}"))

    inspector = inspect(engine)
    if "access_codes" in inspector.get_table_names():
        columns = {col["name"] for col in inspector.get_columns("access_codes")}
        access_code_migrations = [
            ("max_uses", "INTEGER DEFAULT 1"),
            ("used_count", "INTEGER DEFAULT 0"),
            ("used_by_user_id", "VARCHAR"),
            ("used_at", "TIMESTAMP"),
            ("expires_at", "TIMESTAMP"),
            ("plan_type", "VARCHAR DEFAULT 'invite'"),
            ("batch", "VARCHAR"),
            ("created_at", "TIMESTAMP"),
        ]
        with engine.begin() as conn:
            for column, definition in access_code_migrations:
                if column not in columns:
                    conn.execute(text(f"ALTER TABLE access_codes ADD COLUMN {column} {definition}"))
            conn.execute(text("UPDATE access_codes SET max_uses = 1 WHERE max_uses IS NULL"))
            conn.execute(text("UPDATE access_codes SET used_count = 0 WHERE used_count IS NULL"))
            conn.execute(text("UPDATE access_codes SET plan_type = 'invite' WHERE plan_type IS NULL"))
            conn.execute(text("UPDATE access_codes SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create all tables (new ones only) and run migrations
    Base.metadata.create_all(bind=engine)
    _migrate()
    db = SessionLocal()
    try:
        # Ensure default user exists
        default_user = db.query(User).filter(User.id == "default_user").first()
        if not default_user:
            db.add(User(id="default_user"))
            db.commit()

        # Seed system prompts (only insert if key does not exist yet)
        _seed_prompts(db)
        migrate_life_domains_to_global(db)

        # Seed default access code
        if not db.query(AccessCode).first():
            db.add(AccessCode(
                code="STUDY2024",
                description="研究用邀请码",
                is_active=True,
                max_uses=1,
                used_count=0,
                plan_type="invite",
                batch="default",
            ))
            db.commit()
    finally:
        db.close()
    yield


_PROMPT_SEEDS = [
    ("safety_check",          "安全风险评估：判断用户输入的风险等级（safe/mild/high/crisis）",          SAFETY_CHECK_SYSTEM),
    ("structured_extraction", "BA结构化提取：从用户记录中提取活动、想法、愉悦度、重要性",                STRUCTURED_EXTRACTION_SYSTEM),
    ("empathic_feedback",     "小暖即时反馈：对用户完成的活动给出温暖的正向强化回应",                    EMPATHIC_FEEDBACK_SYSTEM),
    ("chatbot_core",          "小暖核心人格：角色定位、BA原则、对话风格、安全规则（三条路径共用）",        CHATBOT_CORE_PROMPT),
]


_PROMPT_HOTLINE_REPLACEMENTS = [
    (
        "全国心理援助热线 400-161-9995",
        "全国统一心理援助热线 12356、希望24热线 400-161-9995",
    ),
]


def _seed_prompts(db):
    from datetime import datetime
    for key, description, content in _PROMPT_SEEDS:
        existing = db.query(SystemPrompt).filter(SystemPrompt.key == key).first()
        if not existing:
            db.add(SystemPrompt(
                key=key,
                content=content,
                description=description,
                updated_at=datetime.now(),
            ))
        elif existing.content:
            updated_content = existing.content
            for old, new in _PROMPT_HOTLINE_REPLACEMENTS:
                updated_content = updated_content.replace(old, new)
            if updated_content != existing.content:
                existing.content = updated_content
                existing.updated_at = datetime.now()
    db.commit()


app = FastAPI(title="LV-CBT API", lifespan=lifespan)

# CORS - allow all origins in dev mode
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(records.router)
app.include_router(stats.router)
app.include_router(activities.router)
app.include_router(chatbot.router)
app.include_router(auth.router)
app.include_router(supporters.router)
app.include_router(audio.router)
app.include_router(assessments.router)
app.include_router(billing.router)


@app.get("/")
async def root():
    return {"status": "ok", "message": "LV-CBT API is running"}
