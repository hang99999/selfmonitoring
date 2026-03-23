from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, SessionLocal
from app.models import Base, User
from app.routers import records, insights, stats


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables and ensure default user exists
    Base.metadata.create_all(bind=engine)
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


@app.get("/")
async def root():
    return {"status": "ok", "message": "LV-CBT API is running"}
