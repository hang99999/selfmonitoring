"""Phase prompt dispatcher."""

from . import s1_intro, s2_setup, s3_first_review, s4_review_cycle

_PHASE_MODULES = {
    "intro": s1_intro,
    "setup": s2_setup,
    "first_review": s3_first_review,
    "review_cycle": s4_review_cycle,
}


def treatment_module_prompt(state: dict) -> tuple[str, bool, bool]:
    """返回 (prompt文本, needs_global_ctx, needs_session_ctx)。
    builder 根据这两个 flag 决定是否注入对应上下文块。
    """
    phase = state.get("treatment_phase", "intro")
    mod = _PHASE_MODULES.get(phase, s1_intro)
    return mod.get_prompt(state), mod.NEEDS_GLOBAL_CTX, mod.NEEDS_SESSION_CTX
