from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


# --- Request Schemas ---

class RecordSubmitRequest(BaseModel):
    text: str
    user_id: str = "default_user"
    planned_activity_id: Optional[str] = None
    # User-provided fields (skip AI extraction, run safety+feedback async)
    activity: Optional[str] = None
    pleasure_score: Optional[float] = None
    importance_score: Optional[float] = None
    life_domain_id: Optional[str] = None  # for quick-save path; None = "其他"
    audio_record_id: Optional[str] = None  # 关联已上传的录音记录


class RecordConfirmRequest(BaseModel):
    activity: Optional[str] = None
    thought: Optional[str] = None
    pleasure_score: Optional[float] = None
    importance_score: Optional[float] = None
    life_domain_id: Optional[str] = None  # None = "其他"; only applied if field is in request body


# --- Activity Library Schemas ---

class LifeDomainCreate(BaseModel):
    name: str
    description: Optional[str] = None
    user_id: Optional[str] = None


class LifeDomainResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ValueCreate(BaseModel):
    life_domain_id: str
    content: str
    user_id: str = "default_user"


class ValueResponse(BaseModel):
    id: str
    user_id: str
    life_domain_id: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityCreate(BaseModel):
    name: str
    value_id: Optional[str] = None
    life_domain_id: Optional[str] = None
    difficulty_rank: Optional[int] = None
    user_id: str = "default_user"


class ActivityResponse(BaseModel):
    id: str
    user_id: str
    value_id: Optional[str] = None
    life_domain_id: Optional[str] = None
    name: str
    difficulty_rank: Optional[int] = None
    is_in_library: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PlannedActivityCreate(BaseModel):
    activity_id: Optional[str] = None
    activity_name: str
    life_domain_id: Optional[str] = None
    value_id: Optional[str] = None
    scheduled_date: str  # YYYY-MM-DD
    scheduled_time: Optional[str] = None  # HH:MM
    user_id: str = "default_user"


class PlannedActivityResponse(BaseModel):
    id: str
    user_id: str
    activity_id: Optional[str] = None
    activity_name: str
    life_domain_id: Optional[str] = None
    value_id: Optional[str] = None
    scheduled_date: str
    scheduled_time: Optional[str] = None
    completed: bool
    completion_record_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PlannedActivityComplete(BaseModel):
    completion_record_id: Optional[str] = None


class PlannedActivityReschedule(BaseModel):
    scheduled_date: str  # YYYY-MM-DD
    scheduled_time: Optional[str] = None  # HH:MM or None for all-day


# --- Daily Mood Schemas ---

class DailyMoodCreate(BaseModel):
    date: str  # YYYY-MM-DD
    mood_score: float = Field(..., ge=0, le=10)
    user_id: str = "default_user"


class DailyMoodResponse(BaseModel):
    id: str
    user_id: str
    date: str
    mood_score: float
    created_at: datetime

    class Config:
        from_attributes = True


# --- Record Schemas ---

class MoodRecordResponse(BaseModel):
    id: str
    user_id: str
    timestamp: datetime
    raw_text: str
    raw_audio_path: Optional[str] = None
    activity: Optional[str] = None
    thought: Optional[str] = None
    pleasure_score: Optional[float] = None
    importance_score: Optional[float] = None
    planned_activity_id: Optional[str] = None
    voice_valence: Optional[float] = None
    voice_arousal: Optional[float] = None
    combined_emotion_score: Optional[float] = None
    life_domain_id: Optional[str] = None
    ai_immediate_feedback: Optional[str] = None
    risk_level: str = "safe"
    cognitive_distortion: Optional[str] = None
    confirmed: bool = False

    class Config:
        from_attributes = True


class TodayStatsRecord(BaseModel):
    timestamp: datetime
    pleasure_score: Optional[float] = None
    importance_score: Optional[float] = None
    activity: Optional[str] = None
    planned_activity_id: Optional[str] = None


class TodayStatsResponse(BaseModel):
    records: List[TodayStatsRecord]
    count: int
    avg_pleasure: Optional[float] = None
    avg_importance: Optional[float] = None
    daily_mood_score: Optional[float] = None


class DailyData(BaseModel):
    date: str
    avg_pleasure: Optional[float] = None
    avg_importance: Optional[float] = None
    count: int
    daily_mood_score: Optional[float] = None


class WeekStatsResponse(BaseModel):
    daily_data: List[DailyData]
    total_count: int
    avg_pleasure: Optional[float] = None
    avg_importance: Optional[float] = None


class MonthStatsResponse(BaseModel):
    daily_data: List[DailyData]
    total_count: int
    avg_pleasure: Optional[float] = None
    avg_importance: Optional[float] = None


# --- Domain Radar Schemas ---

class DomainRadarItem(BaseModel):
    domain_id: Optional[str] = None  # None = "其他"
    domain_name: str
    count: int


# --- Supporter Schemas ---

class SupporterCreate(BaseModel):
    name: str
    relationship: Optional[str] = None
    notes: Optional[str] = None
    user_id: str = "default_user"


class SupporterUpdate(BaseModel):
    name: Optional[str] = None
    relationship: Optional[str] = None
    notes: Optional[str] = None


class SupporterResponse(BaseModel):
    id: str
    user_id: str
    name: str
    relationship: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PlannedActivitySupporterCreate(BaseModel):
    supporter_id: str
    help_description: Optional[str] = None


class PlannedActivitySupporterResponse(BaseModel):
    id: str
    planned_activity_id: str
    supporter_id: str
    help_description: Optional[str] = None
    created_at: datetime
    supporter_name: Optional[str] = None
    supporter_relationship: Optional[str] = None

    class Config:
        from_attributes = True


# --- Auth Schemas ---

class UnlockRequest(BaseModel):
    user_id: str
    participant_code: str
    invite_code: str


class UnlockResponse(BaseModel):
    ok: bool
    message: str
    participant_code: Optional[str] = None
    is_unlocked: bool = False


# --- Audio Schemas ---

class AudioUploadResponse(BaseModel):
    audio_record_id: str
    transcript: str
    file_size_bytes: Optional[int] = None
    whisper_error: Optional[str] = None  # 转写失败时说明原因，但录音仍已保存


class AudioRecordResponse(BaseModel):
    id: str
    user_id: str
    mood_record_id: Optional[str] = None
    file_path: str
    file_size_bytes: Optional[int] = None
    duration_sec: Optional[float] = None
    transcript_text: Optional[str] = None
    whisper_model: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Assessment Schemas ---

class AssessmentResultCreate(BaseModel):
    user_id: str = "default_user"
    scale_type: str
    score: int
    display_score: Optional[int] = None
    severity_level: Optional[str] = None
    answers: List[int]


class AssessmentResultResponse(BaseModel):
    id: str
    user_id: str
    scale_type: str
    score: int
    display_score: Optional[int] = None
    severity_level: Optional[str] = None
    answers: List[int]
    created_at: datetime

    class Config:
        from_attributes = True
