"""Chatbot system prompt assembler.

组装逻辑：
  自由聊天  → free_chat_base + selected_mode_prompt + global_ctx + session_ctx
  阶段对话  → phase_prompt + [global_ctx?] + [session_ctx?]   （phase 自包含，不加 core）
  触发对话  → trigger_prompt

phase 模块通过 NEEDS_GLOBAL_CTX / NEEDS_SESSION_CTX 旗标声明是否需要注入通用上下文；
目前所有 phase 均不注入通用上下文，每个 phase prompt 内部自行从 state 取所需变量。
trigger 模块不注入通用上下文；每个 trigger prompt 内部自行从 state 取所需变量。
S1 intro 不需要（用户尚无活动库/价值观，注入反而浪费 token 并干扰模型）。
"""

from .free_chat import build_free_chat_prompt
from .context import build_global_ctx, build_session_ctx
from .phases import treatment_module_prompt
from .triggers import trigger_module_prompt


def chatbot_system_prompt(
    user_state: dict,
    companion_name: str,
    db=None,
    session_intent: str | None = None,
    free_chat_route: dict | None = None,
    manual_context: str = "",
) -> str:
    if session_intent is None:
        # 自由聊天：自包含基础 prompt + 当前模式 prompt + 完整上下文
        return (
            build_free_chat_prompt(free_chat_route, manual_context=manual_context)
            + build_global_ctx(user_state)
            + build_session_ctx(user_state)
        )

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
        return trigger_module_prompt(trigger_key, user_state)

    # 兜底：自由聊天
    return (
        build_free_chat_prompt(free_chat_route, manual_context=manual_context)
        + build_global_ctx(user_state)
        + build_session_ctx(user_state)
    )
