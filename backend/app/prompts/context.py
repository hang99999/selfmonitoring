"""Builds dynamic context blocks injected into the chatbot system prompt."""

import json


def build_global_ctx(state: dict) -> str:
    """用户全局画像（跨会话持久数据：价值观、活动库、生活领域）。
    仅在需要该上下文的阶段注入（S1 intro 不注入）。
    """
    companion_name = "小暖"
    days = state.get("days_since_registration", 0)
    values_summary = json.dumps(state.get("user_values_summary", {}), ensure_ascii=False)
    top_activities = state.get("user_top_activities", [])
    areas_with = state.get("life_areas_with_activities", [])
    areas_without = state.get("life_areas_without_activities", [])
    user_summary = state.get("user_summary")

    ctx = f"""
---

## 全局用户画像（跨会话持久，每次都注入）

- 伙伴名字：{companion_name}
- 注册天数：{days} 天
- 用户价值观摘要：{values_summary}
- 用户常用活动列表：{top_activities}
- 有活动的生活领域：{areas_with}
- 无活动的生活领域：{areas_without}"""

    if user_summary:
        ctx += f"\n- 跨会话用户画像摘要：{user_summary}"

    return ctx


def build_session_ctx(state: dict) -> str:
    """当前会话实时状态（动态计算数据：记录数、完成率、情绪趋势等）。"""
    return f"""

## 当前会话状态（动态计算，仅反映最新数据）

### 活动记录
- 本周记录总数：{state.get('total_records_this_week', 0)}
- 连续无记录天数：{state.get('consecutive_days_no_record', 0)}
- 日均记录数（近7天）：{state.get('avg_daily_records', 0)}
- 近7天活动愉悦度均值：{state.get('avg_enjoyment_score', 'N/A')}（0-10）
- 近7天活动重要性均值：{state.get('avg_importance_score', 'N/A')}（0-10）
- 高重要低愉悦活动比例：{state.get('high_importance_low_enjoyment_ratio', 0)}

### 活动计划
- 本周计划数：{state.get('planned_activities_this_week', 0)}
- 本周已完成：{state.get('completed_planned_activities', 0)}
- 本周完成率：{state.get('completion_rate_this_week', 0)}
- 上周完成率：{state.get('completion_rate_last_week', 0)}
- 连续高完成率（≥90%）周数：{state.get('consecutive_weeks_high_completion', 0)}
- 连续低完成率（<40%）周数：{state.get('consecutive_weeks_low_completion', 0)}
- 连续两次未完成的活动：{state.get('repeatedly_incomplete_activities', [])}
- 近两周未完成总数：{state.get('total_incomplete_two_weeks', 0)}

### 情绪
- 本周日均情绪评分：{state.get('avg_mood_this_week', 'N/A')}（0-10）
- 上周日均情绪评分：{state.get('avg_mood_last_week', 'N/A')}（0-10）
- 情绪趋势：{state.get('mood_trend', 'stable')}
- 连续情绪评分≥7的周数：{state.get('consecutive_weeks_good_mood', 0)}

### 今日
- 今日计划活动：{state.get('today_planned_activities', [])}
- 今日已完成：{state.get('today_completed_activities', [])}
- 今日已记录：{state.get('today_recorded_activities', [])}
- 今日情绪评分：{state.get('today_mood', 'N/A')}"""
