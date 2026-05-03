"""Chatbot system prompt assembler.

组装逻辑：
  自由聊天  → core + dialogue_modes + global_ctx + session_ctx
  阶段对话  → phase_prompt + [global_ctx?] + session_ctx   （phase 自包含，不加 core）
  触发对话  → core + trigger_prompt + global_ctx + session_ctx

phase 模块通过 NEEDS_GLOBAL_CTX 旗标声明是否需要注入 global_ctx。
S1 intro 不需要（用户尚无活动库/价值观，注入反而浪费 token 并干扰模型）。
"""

from ._db import get_prompt
from .core import CHATBOT_CORE_PROMPT
from .free_chat import CHATBOT_DIALOGUE_MODES
from .context import build_global_ctx, build_session_ctx
from .phases import treatment_module_prompt
from .triggers import get_trigger_prompt


def chatbot_system_prompt(
    user_state: dict,
    companion_name: str,
    db=None,
    session_intent: str | None = None,
) -> str:
    base = get_prompt("chatbot_core", CHATBOT_CORE_PROMPT, db)

    if session_intent is None:
        # 自由聊天：核心人格 + 对话模式 A-E + 完整上下文
        return base + CHATBOT_DIALOGUE_MODES + build_global_ctx(user_state) + build_session_ctx(user_state)

    if session_intent.startswith("phase:"):
        intent_phase = session_intent.removeprefix("phase:")
        state = {**user_state, "treatment_phase": intent_phase}
        phase_text, needs_global, needs_session = treatment_module_prompt(state)
        ctx = ""
        if needs_global:
            ctx += build_global_ctx(user_state)
        if needs_session:
            ctx += build_session_ctx(user_state)
        return phase_text + ctx

    if session_intent.startswith("trigger:"):
        trigger_key = session_intent.removeprefix("trigger:")
        return base + get_trigger_prompt(trigger_key) + build_global_ctx(user_state) + build_session_ctx(user_state)

    # 兜底：自由聊天
    return base + CHATBOT_DIALOGUE_MODES + build_global_ctx(user_state) + build_session_ctx(user_state)
