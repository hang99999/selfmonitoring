from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, SessionLocal
from app.models import Base, User
from app.routers import records, insights, stats, activities, chatbot


def _migrate(conn):
    """Add missing columns to existing tables (safe to run multiple times)."""
    cursor = conn.cursor()
    # mood_records 新增字段
    migrations = [
        "ALTER TABLE mood_records ADD COLUMN pleasure_score REAL",
        "ALTER TABLE mood_records ADD COLUMN importance_score REAL",
        "ALTER TABLE mood_records ADD COLUMN planned_activity_id TEXT",
        # chatbot tables (SQLAlchemy create_all handles new tables; these are column-level fallbacks)
    ]
    for sql in migrations:
        try:
            cursor.execute(sql)
        except Exception:
            pass  # 列已存在，忽略
    conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create all tables (new ones only) and run migrations
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        _migrate(conn.connection)
    db = SessionLocal()
    try:
        default_user = db.query(User).filter(User.id == "default_user").first()
        if not default_user:
            db.add(User(id="default_user"))
            db.commit()
    finally:
        db.close()
    yield


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
app.include_router(insights.router)
app.include_router(stats.router)
app.include_router(activities.router)
app.include_router(chatbot.router)


@app.get("/")
async def root():
    return {"status": "ok", "message": "LV-CBT API is running"}
