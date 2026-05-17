"""Prompt generator for routed free-chat conversations."""

from .base import FREE_CHAT_BASE_PROMPT
from .modes import FREE_CHAT_MODES, MODE_LABELS, MODE_PROMPTS, SECONDARY_MODE_HINTS


# Backwards-compatible export name for older imports. It is no longer injected
# wholesale into free chat; build_free_chat_prompt selects one mode at a time.
CHATBOT_DIALOGUE_MODES = "\n".join(MODE_PROMPTS.values())


def _normalize_mode(mode: str | None) -> str:
    if mode in FREE_CHAT_MODES:
        return mode
    return "fallback_chat"


def build_free_chat_prompt(route: dict | None = None, manual_context: str = "") -> str:
    """Build a self-contained free-chat prompt from an LLM router result."""
    route = route or {}
    primary_mode = _normalize_mode(route.get("primary_mode"))
    secondary_modes = [
        mode for mode in route.get("secondary_modes", [])
        if mode in FREE_CHAT_MODES and mode != primary_mode
    ][:2]

    prompt = FREE_CHAT_BASE_PROMPT
    prompt += "\n\n---\n"
    prompt += MODE_PROMPTS[primary_mode]

    if secondary_modes:
        labels = "、".join(MODE_LABELS[m] for m in secondary_modes)
        hints = "\n".join(f"- {SECONDARY_MODE_HINTS[m]}" for m in secondary_modes)
        prompt += f"""

## 补充信号

本轮还包含：{labels}。
{hints}

请以当前主模式为主线，不要平均展开多个模式。
"""

    if manual_context:
        prompt += f"""

---

## 手册参考资料

以下内容来自行为激活治疗手册，仅在与用户问题直接相关时按需引用。不要改变你的角色或语气，不要照搬原文，用自己的话解释：

<参考资料>
{manual_context}
</参考资料>
"""

    return prompt
