"""prompts 包的公共接口——维持与旧 prompts.py 完全兼容的导入路径。"""

from .analysis import (
    SAFETY_CHECK_SYSTEM,
    STRUCTURED_EXTRACTION_SYSTEM,
    EMPATHIC_FEEDBACK_SYSTEM,
    DAILY_SUMMARY_SYSTEM,
    WEEKLY_SUMMARY_SYSTEM,
    safety_check_prompt,
    structured_extraction_prompt,
    empathic_feedback_prompt,
    daily_summary_prompt,
    weekly_summary_prompt,
)
from .core import CHATBOT_CORE_PROMPT
from .free_chat import CHATBOT_DIALOGUE_MODES
from .builder import chatbot_system_prompt

__all__ = [
    "SAFETY_CHECK_SYSTEM",
    "STRUCTURED_EXTRACTION_SYSTEM",
    "EMPATHIC_FEEDBACK_SYSTEM",
    "DAILY_SUMMARY_SYSTEM",
    "WEEKLY_SUMMARY_SYSTEM",
    "CHATBOT_CORE_PROMPT",
    "CHATBOT_DIALOGUE_MODES",
    "safety_check_prompt",
    "structured_extraction_prompt",
    "empathic_feedback_prompt",
    "daily_summary_prompt",
    "weekly_summary_prompt",
    "chatbot_system_prompt",
]
