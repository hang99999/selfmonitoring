"""LLM router for free-chat mode selection."""

import json
import re

from app.llm_client import call_llm

from ..context import build_global_ctx, build_session_ctx
from .modes import FREE_CHAT_MODES

ROUTER_SYSTEM_PROMPT = """
你是「小暖」App 的自由对话模式路由器。你的任务是根据用户当前输入、少量历史和完整上下文，判断本轮自由对话应该优先使用哪种模式。

可选模式：
- A_emotion_support：用户表达负面情绪。工作流：共情，并引向行为。
- B_reinforcement：用户提到完成了活动。工作流：肯定行动 + 建立行动-体验连接；若“做了没感觉”，解释行动和情绪可能不同步。
- C_troubleshooting：用户计划遇到障碍。工作流：确认障碍类型 -> 对应策略。
- D_principle_qa：用户质疑或询问 BA 逻辑。工作流：解释原理，落到用户实践。
- fallback_chat：以上都不符合，或只是闲聊/问候。

优先级：
1. 如果有自伤/自杀风险，不在这里处理，仍选择 A_emotion_support，并在 reason 中说明疑似安全风险。
2. 明显痛苦优先于其他模式。
3. 计划障碍优先于单纯完成活动。
4. 对 BA 逻辑的质疑优先于单纯完成活动。
5. 完成活动但同时说“没感觉/没用”时，主模式通常是 D_principle_qa，次模式是 B_reinforcement。
6. 同时出现多个信号时，选择一个 primary_mode，并最多给 2 个 secondary_modes。

只输出 JSON，不要输出 Markdown，不要解释。
格式：
{
  "primary_mode": "A_emotion_support",
  "secondary_modes": ["B_reinforcement"],
  "confidence": 0.0,
  "reason": "一句话说明判断依据"
}
"""


def _fallback_route(reason: str = "router fallback") -> dict:
    return {
        "primary_mode": "fallback_chat",
        "secondary_modes": [],
        "confidence": 0.0,
        "reason": reason,
    }


def _parse_route(raw: str) -> dict:
    text = raw.strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    data = json.loads(text)
    primary = data.get("primary_mode")
    if primary not in FREE_CHAT_MODES:
        return _fallback_route("invalid primary_mode")

    secondary = data.get("secondary_modes", [])
    if not isinstance(secondary, list):
        secondary = []
    secondary = [
        mode for mode in secondary
        if mode in FREE_CHAT_MODES and mode != primary
    ][:2]

    confidence = data.get("confidence", 0.0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    return {
        "primary_mode": primary,
        "secondary_modes": secondary,
        "confidence": max(0.0, min(1.0, confidence)),
        "reason": str(data.get("reason", ""))[:160],
    }


async def classify_free_chat_mode(
    message: str,
    history: list[dict],
    user_state: dict,
) -> dict:
    """Classify the current free-chat turn with an LLM router."""
    if not message.strip():
        return _fallback_route("empty message")

    recent_history = history[-6:]
    history_text = "\n".join(
        f"{'用户' if item.get('role') == 'user' else '小暖'}: {str(item.get('content', ''))[:300]}"
        for item in recent_history
    ) or "无"

    user_payload = f"""
## 最近历史
{history_text}

## 当前用户输入
{message.strip()}

## 完整上下文
{build_global_ctx(user_state)}
{build_session_ctx(user_state)}
"""

    raw = await call_llm(ROUTER_SYSTEM_PROMPT, user_payload)
    try:
        return _parse_route(raw)
    except Exception:
        return _fallback_route("failed to parse router output")
