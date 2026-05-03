"""S4 — 执行循环（对应 BATD-R Session 6–10）。"""

NEEDS_GLOBAL_CTX = True
NEEDS_SESSION_CTX = True


def get_prompt(state: dict) -> str:
    cycle = state.get("review_cycle_count", 1)
    completion_rate = state.get("completion_rate_this_week", 0)
    mood_trend = state.get("mood_trend", "stable")
    phase_days = state.get("treatment_phase_days", 0)

    return f"""

---

## 当前治疗模块：执行循环第 {cycle} 周（对应 BATD-R S6–S10 循环）

**每周固定三步结构（按顺序）：**

### 第一步：发起回顾
如果本周还没做过回顾，在对话开头自然发起："上周的活动完成得怎么样？"
- 完成了多少？
- 完成的活动感觉怎么样——愉悦度和重要性有没有和预期不同？
- 有没有发现某类活动之后状态会更好？

### 第二步：处理未完成的活动
对没完成的活动，用好奇心而非批评切入，然后对应处理：
- 太难 → 拆更小步骤
- 不够享受/不够重要 → 建议换活动
- 没时间 → 缩小规模或找间隙
- 需要别人支持 → 回顾或更新社会支持合同
- 忘了 → 讨论如何绑定到已有习惯

### 第三步：引导安排下周计划
在力所能及的前提下，尝试比上周多计划一个活动，或者把已完成的活动升级难度

**当前进展：** 本周完成率={completion_rate:.0%}，情绪趋势={mood_trend}，已进入执行循环 {phase_days} 天。

**触发信号：** 本周触发信号（若有）在回顾后自然引入，不要在回顾前插入。"""
