from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


# --- Request Schemas ---

class RecordSubmitRequest(BaseModel):
    text: str
    user_id: str = "default_user"


class RecordConfirmRequest(BaseModel):
    activity: Optional[str] = None
    thought: Optional[str] = None
    emotion_type: Optional[str] = None
    emotion_intensity: Optional[int] = None


# --- Response Schemas ---

class MoodRecordResponse(BaseModel):
    id: str
    user_id: str
    timestamp: datetime
    raw_text: str
    raw_audio_path: Optional[str] = None
    activity: Optional[str] = None
    thought: Optional[str] = None
    emotion_type: Optional[str] = None
    emotion_intensity: Optional[int] = None
    voice_valence: Optional[float] = None
    voice_arousal: Optional[float] = None
    combined_emotion_score: Optional[float] = None
    ai_immediate_feedback: Optional[str] = None
    risk_level: str = "safe"
    cognitive_distortion: Optional[str] = None
    confirmed: bool = False

    class Config:
        from_attributes = True


class InsightReportResponse(BaseModel):
    id: str
    user_id: str
    report_type: str
    generated_at: datetime
    content: Optional[str] = None
    patterns: Optional[str] = None
    cbt_suggestions: Optional[str] = None

    class Config:
        from_attributes = True


class TodayStatsRecord(BaseModel):
    timestamp: datetime
    emotion_type: Optional[str] = None
    emotion_intensity: Optional[int] = None


class TodayStatsResponse(BaseModel):
    records: List[TodayStatsRecord]
    count: int
    avg_intensity: Optional[float] = None


class DailyData(BaseModel):
    date: str
    avg_intensity: Optional[float] = None
    count: int
    dominant_emotion: Optional[str] = None


class WeekStatsResponse(BaseModel):
    daily_data: List[DailyData]
    total_count: int
    emotion_distribution: Dict[str, int]
    avg_intensity: Optional[float] = None


class MonthStatsResponse(BaseModel):
    daily_data: List[DailyData]
    total_count: int
    emotion_distribution: Dict[str, int]
    avg_intensity: Optional[float] = None
