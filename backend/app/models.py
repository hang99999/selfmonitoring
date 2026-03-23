import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey
from app.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    created_at = Column(DateTime, default=utcnow)


class MoodRecord(Base):
    __tablename__ = "mood_records"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), default="default_user")
    timestamp = Column(DateTime, default=utcnow)
    raw_text = Column(Text, nullable=False)
    raw_audio_path = Column(String, nullable=True)
    activity = Column(String, nullable=True)
    thought = Column(String, nullable=True)
    emotion_type = Column(String, nullable=True)
    emotion_intensity = Column(Integer, nullable=True)
    voice_valence = Column(Float, nullable=True)
    voice_arousal = Column(Float, nullable=True)
    combined_emotion_score = Column(Float, nullable=True)
    ai_immediate_feedback = Column(Text, nullable=True)
    risk_level = Column(String, default="safe")
    cognitive_distortion = Column(String, nullable=True)
    confirmed = Column(Boolean, default=False)


class InsightReport(Base):
    __tablename__ = "insight_reports"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"))
    report_type = Column(String, nullable=False)  # "daily" or "weekly"
    generated_at = Column(DateTime, default=utcnow)
    content = Column(Text, nullable=True)
    patterns = Column(Text, nullable=True)  # JSON string
    cbt_suggestions = Column(Text, nullable=True)  # JSON string
