import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey
from app.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def localnow() -> datetime:
    return datetime.now()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    created_at = Column(DateTime, default=localnow)
    participant_code = Column(String, nullable=True)   # e.g. "P001", set on unlock
    is_unlocked = Column(Boolean, default=False)


class AccessCode(Base):
    """研究/付费邀请码 — 在 pgAdmin 的 access_codes 表中管理"""
    __tablename__ = "access_codes"

    code = Column(String, primary_key=True)      # e.g. "STUDY2024"
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)


class LifeDomain(Base):
    """生活领域（5个）：亲密关系 / 教育与职业 / 休闲兴趣 / 身心灵 / 日常责任"""
    __tablename__ = "life_domains"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), default="default_user")
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=localnow)


class Value(Base):
    """价值观：在某个生活领域中，用户理想的生活方式"""
    __tablename__ = "values"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), default="default_user")
    life_domain_id = Column(String, ForeignKey("life_domains.id"), nullable=False)
    content = Column(String, nullable=False)  # e.g. "做一个关心家人的人"
    created_at = Column(DateTime, default=localnow)


class Activity(Base):
    """活动：可观察、可测量、最小化的具体行为"""
    __tablename__ = "activities"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), default="default_user")
    value_id = Column(String, ForeignKey("values.id"), nullable=True)
    life_domain_id = Column(String, ForeignKey("life_domains.id"), nullable=True)
    name = Column(String, nullable=False)  # e.g. "每周二晚陪妈妈打一通电话"
    difficulty_rank = Column(Integer, nullable=True)  # 1-15，难度排序
    is_in_library = Column(Boolean, default=True)
    created_at = Column(DateTime, default=localnow)


class PlannedActivity(Base):
    """计划活动：用户预先安排的具体活动"""
    __tablename__ = "planned_activities"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), default="default_user")
    activity_id = Column(String, ForeignKey("activities.id"), nullable=True)
    activity_name = Column(String, nullable=False)  # 冗余存储，防止活动被删除后丢失
    life_domain_id = Column(String, ForeignKey("life_domains.id"), nullable=True)
    value_id = Column(String, ForeignKey("values.id"), nullable=True)
    scheduled_date = Column(String, nullable=False)   # YYYY-MM-DD
    scheduled_time = Column(String, nullable=True)    # HH:MM
    completed = Column(Boolean, default=False)
    completion_record_id = Column(String, nullable=True)  # 关联的 MoodRecord.id
    created_at = Column(DateTime, default=localnow)


class MoodRecord(Base):
    __tablename__ = "mood_records"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), default="default_user")
    timestamp = Column(DateTime, default=localnow)
    raw_text = Column(Text, nullable=False)
    raw_audio_path = Column(String, nullable=True)
    activity = Column(String, nullable=True)
    thought = Column(String, nullable=True)
    # BA 核心：愉悦度与重要性双维度评分（0-10）
    pleasure_score = Column(Float, nullable=True)
    importance_score = Column(Float, nullable=True)
    # 关联计划活动
    planned_activity_id = Column(String, ForeignKey("planned_activities.id"), nullable=True)
    # 保留情绪类型和情绪强度以便向后兼容
    emotion_type = Column(String, nullable=True)
    emotion_intensity = Column(Integer, nullable=True)
    voice_valence = Column(Float, nullable=True)
    voice_arousal = Column(Float, nullable=True)
    combined_emotion_score = Column(Float, nullable=True)
    ai_immediate_feedback = Column(Text, nullable=True)
    risk_level = Column(String, default="safe")
    cognitive_distortion = Column(String, nullable=True)
    confirmed = Column(Boolean, default=False)


class DailyMood(Base):
    """每日整体情绪评分（0-10，单次，遵循 BATD-R 修订版设计）"""
    __tablename__ = "daily_moods"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), default="default_user")
    date = Column(String, nullable=False)  # YYYY-MM-DD
    mood_score = Column(Float, nullable=False)  # 0-10
    created_at = Column(DateTime, default=localnow)


class InsightReport(Base):
    __tablename__ = "insight_reports"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"))
    report_type = Column(String, nullable=False)  # "daily" or "weekly"
    generated_at = Column(DateTime, default=localnow)
    content = Column(Text, nullable=True)
    patterns = Column(Text, nullable=True)  # JSON string
    cbt_suggestions = Column(Text, nullable=True)  # JSON string


class TriggerLog(Base):
    """记录每种触发对话的上次执行时间，用于冷却控制"""
    __tablename__ = "trigger_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    trigger_type = Column(String, nullable=False)
    last_executed = Column(DateTime, default=localnow)


class CompanionSettings(Base):
    """用户给伙伴起的名字"""
    __tablename__ = "companion_settings"

    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    companion_name = Column(String, nullable=False, default="小暖")
    updated_at = Column(DateTime, default=localnow)


class SystemPrompt(Base):
    """LLM prompt 模板 — 可在 pgAdmin 中直接编辑 content 字段来调整模型行为"""
    __tablename__ = "system_prompts"

    key = Column(String, primary_key=True)   # e.g. "safety_check", "chatbot"
    content = Column(Text, nullable=False)   # 完整的 system prompt 文本
    description = Column(String, nullable=True)  # 简短说明，方便在 pgAdmin 里识别
    updated_at = Column(DateTime, default=localnow)
