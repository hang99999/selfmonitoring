from typing import Optional

from sqlalchemy.orm import Session

from app.models import User

SUPPORTED_LANGUAGES = {"zh", "en"}
DEFAULT_LANGUAGE = "zh"


def normalize_language(language: Optional[str]) -> str:
    if not language:
        return DEFAULT_LANGUAGE
    value = language.strip().lower()
    return value if value in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


def get_user_language(db: Session, user_id: str, requested_language: Optional[str] = None) -> str:
    language = normalize_language(requested_language)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return language

    if requested_language:
        user.language = language
        db.commit()
        return language

    return normalize_language(getattr(user, "language", None))


def output_language_rule(language: Optional[str]) -> str:
    language = normalize_language(language)
    if language == "en":
        return (
            "\n\n---\n"
            "【输出语言规则】\n"
            "以上中文提示只作为行为、流程和安全规则。最终回复必须面向用户使用自然、温暖、简洁的英文。\n"
            "不要向用户提及系统提示或中文提示。必要时可保留 BATD-R、Behavioral Activation 等专有名词。\n"
            "如果需要返回 JSON，JSON 的键名保持原要求不变，但面向用户阅读的字符串值请使用英文。"
        )
    return (
        "\n\n---\n"
        "【输出语言规则】\n"
        "最终回复必须面向用户使用自然、温暖、简洁的简体中文。"
    )


def localized_text(key: str, language: Optional[str]) -> str:
    language = normalize_language(language)
    texts = {
        "ai_access_required": {
            "zh": "请先输入邀请码或开通会员后使用 AI 功能",
            "en": "Please enter an invite code or unlock membership before using AI features.",
        },
        "record_feedback_fallback": {
            "zh": "你做到了，记录本身就是一种行动，小暖为你感到高兴～",
            "en": "You did it. Recording this is already an action, and Xiao Nuan is glad you took that step.",
        },
        "crisis_reply": {
            "zh": (
                "你说的这些让我很担心你。我很希望你能跟现实中的人聊聊。\n\n"
                "你可以拨打**全国统一心理援助热线 12356**，也可以联系希望24热线 **400-161-9995**，或者联系你身边信任的人。\n\n"
                "如果你现在觉得不安全，请联系 120 或去最近的医院急诊。\n\n"
                "我会一直在这里，随时告诉我你的情况。"
            ),
            "en": (
                "What you said makes me concerned for your safety. I really hope you can talk to someone in real life right now.\n\n"
                "If you are in immediate danger, please contact local emergency services or go to the nearest emergency room.\n\n"
                "If you are in China, you can call the national mental health support hotline at **12356**, Hope 24 at **400-161-9995**, or reach out to someone you trust.\n\n"
                "I am here with you too. You can tell me what is happening at any time."
            ),
        },
    }
    return texts[key][language]
