from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import engine, SessionLocal
from app.models import Base, User, SystemPrompt, AccessCode, CompanionSettings, TreatmentProgress, PhaseConfig
from app.routers import records, stats, activities, chatbot, auth, supporters, audio
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

        # Seed default access code
        if not db.query(AccessCode).first():
            db.add(AccessCode(code="STUDY2024", description="研究用邀请码", is_active=True))
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


@app.get("/")
async def root():
    return {"status": "ok", "message": "LV-CBT API is running"}
