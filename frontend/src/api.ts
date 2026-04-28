import type {
  MoodRecord, InsightReport, DayStats, WeekStats, MonthStats,
  LifeDomain, Value, Activity, PlannedActivity, DailyMood,
  ChatMessage, ChatSession, ChatResponse, UserState, DomainRadarItem,
  TreatmentProgressData, Supporter, PlannedActivitySupporter,
} from './types';

// ── 后端地址 ────────────────────────────────────────────────────────────────
// 开发时手机和电脑在同一 WiFi 下，指向电脑局域网 IP
const BASE = 'http://47.239.197.238:8000';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  // --- Records ---
  submitRecord: (
    text: string,
    userId = 'default_user',
    plannedActivityId?: string,
    quickFields?: { activity: string; pleasure_score: number; importance_score: number },
  ) =>
    request<MoodRecord>('/api/record/submit', {
      method: 'POST',
      body: JSON.stringify({
        text,
        user_id: userId,
        planned_activity_id: plannedActivityId,
        ...quickFields,
      }),
    }),

  confirmRecord: (id: string, updates?: {
    activity?: string;
    thought?: string;
    emotion_type?: string;
    emotion_intensity?: number;
    pleasure_score?: number;
    importance_score?: number;
    life_domain_id?: string | null;
  }) =>
    request<MoodRecord>(`/api/record/${id}/confirm`, {
      method: 'PUT',
      body: JSON.stringify(updates || {}),
    }),

  listRecords: (date?: string, userId = 'default_user') => {
    const params = new URLSearchParams({ user_id: userId });
    if (date) params.set('date', date);
    return request<MoodRecord[]>(`/api/record/list?${params}`);
  },

  getRecord: (id: string) =>
    request<MoodRecord>(`/api/record/${id}`),

  // --- Insights ---
  getDailyInsight: (userId = 'default_user', date?: string) => {
    const params = new URLSearchParams({ user_id: userId });
    if (date) params.set('date', date);
    return request<InsightReport>(`/api/insight/daily?${params}`);
  },

  getWeeklyInsight: (userId = 'default_user') =>
    request<InsightReport>(`/api/insight/weekly?user_id=${userId}`),

  // --- Stats ---
  getStatsToday: (userId = 'default_user') =>
    request<DayStats>(`/api/stats/today?user_id=${userId}`),

  getStatsWeek: (userId = 'default_user') =>
    request<WeekStats>(`/api/stats/week?user_id=${userId}`),

  getStatsMonth: (userId = 'default_user') =>
    request<MonthStats>(`/api/stats/month?user_id=${userId}`),

  getDomainRadar: (period: 'day' | 'week' | 'month', userId = 'default_user') =>
    request<DomainRadarItem[]>(`/api/stats/domain-radar?user_id=${userId}&period=${period}`),

  // --- Life Domains ---
  getDomains: (userId = 'default_user') =>
    request<LifeDomain[]>(`/api/activity/domains?user_id=${userId}`),

  createDomain: (name: string, description?: string, userId = 'default_user') =>
    request<LifeDomain>('/api/activity/domains', {
      method: 'POST',
      body: JSON.stringify({ name, description, user_id: userId }),
    }),

  // --- Values ---
  getValues: (userId = 'default_user', lifeDomainId?: string) => {
    const params = new URLSearchParams({ user_id: userId });
    if (lifeDomainId) params.set('life_domain_id', lifeDomainId);
    return request<Value[]>(`/api/activity/values?${params}`);
  },

  createValue: (lifeDomainId: string, content: string, userId = 'default_user') =>
    request<Value>('/api/activity/values', {
      method: 'POST',
      body: JSON.stringify({ life_domain_id: lifeDomainId, content, user_id: userId }),
    }),

  deleteValue: (valueId: string) =>
    request<{ ok: boolean }>(`/api/activity/values/${valueId}`, { method: 'DELETE' }),

  // --- Activities ---
  getActivities: (userId = 'default_user', lifeDomainId?: string) => {
    const params = new URLSearchParams({ user_id: userId });
    if (lifeDomainId) params.set('life_domain_id', lifeDomainId);
    return request<Activity[]>(`/api/activity/list?${params}`);
  },

  createActivity: (data: {
    name: string;
    value_id?: string;
    life_domain_id?: string;
    difficulty_rank?: number;
    user_id?: string;
  }) =>
    request<Activity>('/api/activity/create', {
      method: 'POST',
      body: JSON.stringify({ user_id: 'default_user', ...data }),
    }),

  deleteActivity: (activityId: string) =>
    request<{ ok: boolean }>(`/api/activity/${activityId}`, { method: 'DELETE' }),

  // --- Planned Activities ---
  getPlanned: (date?: string, userId = 'default_user') => {
    const params = new URLSearchParams({ user_id: userId });
    if (date) params.set('date', date);
    return request<PlannedActivity[]>(`/api/activity/planned?${params}`);
  },

  createPlanned: (data: {
    activity_name: string;
    scheduled_date: string;
    scheduled_time?: string;
    activity_id?: string;
    life_domain_id?: string;
    value_id?: string;
    user_id?: string;
  }) =>
    request<PlannedActivity>('/api/activity/planned', {
      method: 'POST',
      body: JSON.stringify({ user_id: 'default_user', ...data }),
    }),

  completePlanned: (plannedId: string, completionRecordId?: string) =>
    request<PlannedActivity>(`/api/activity/planned/${plannedId}/complete`, {
      method: 'PUT',
      body: JSON.stringify({ completion_record_id: completionRecordId }),
    }),

  deletePlanned: (plannedId: string) =>
    request<{ ok: boolean }>(`/api/activity/planned/${plannedId}`, { method: 'DELETE' }),

  rescheduleActivity: (plannedId: string, scheduledDate: string, scheduledTime?: string) =>
    request<PlannedActivity>(`/api/activity/planned/${plannedId}/reschedule`, {
      method: 'PUT',
      body: JSON.stringify({ scheduled_date: scheduledDate, scheduled_time: scheduledTime ?? null }),
    }),

  breakdownActivity: (plannedId: string) =>
    request<{ steps: string[] }>(`/api/activity/planned/${plannedId}/breakdown`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  // --- Daily Mood ---
  setDailyMood: (date: string, moodScore: number, userId = 'default_user') =>
    request<DailyMood>('/api/activity/daily-mood', {
      method: 'POST',
      body: JSON.stringify({ date, mood_score: moodScore, user_id: userId }),
    }),

  getDailyMood: (date: string, userId = 'default_user') =>
    request<DailyMood | null>(`/api/activity/daily-mood?user_id=${userId}&date=${date}`),

  // --- Chatbot ---
  getChatbotState: (userId = 'default_user') =>
    request<UserState>(`/api/chatbot/state?user_id=${userId}`),

  createChatSession: (userId = 'default_user') =>
    request<{ id: number; title: string | null; created_at: string }>(
      `/api/chatbot/session?user_id=${userId}`,
      { method: 'POST' },
    ),

  getCurrentSession: (userId = 'default_user') =>
    request<{ id: number; title: string | null; created_at: string } | null>(
      `/api/chatbot/session/current?user_id=${userId}`,
    ),

  listSessions: (userId = 'default_user') =>
    request<ChatSession[]>(`/api/chatbot/sessions?user_id=${userId}`),

  getSessionMessages: (sessionId: number, userId = 'default_user') =>
    request<{ id: number; role: 'user' | 'assistant'; content: string; created_at: string }[]>(
      `/api/chatbot/session/${sessionId}/messages?user_id=${userId}`,
    ),

  sendChatMessage: (sessionId: number, message: string, userId = 'default_user', sessionIntent?: string) =>
    request<ChatResponse>('/api/chatbot/chat', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, session_id: sessionId, message, session_intent: sessionIntent ?? null }),
    }),

  getTreatmentProgress: (userId = 'default_user') =>
    request<TreatmentProgressData>(`/api/chatbot/treatment/progress?user_id=${userId}`),

  advancePhase: (userId = 'default_user') =>
    request<{ ok: boolean; new_phase?: string; reason?: string }>('/api/chatbot/treatment/advance', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),

  debugSetPhase: (userId: string, phase: string, phaseDays = 7, reviewCycleCount = 1) =>
    request<{ ok: boolean }>('/api/chatbot/treatment/debug', {
      method: 'PUT',
      body: JSON.stringify({ user_id: userId, phase, phase_days: phaseDays, review_cycle_count: reviewCycleCount }),
    }),

  debugSetTrigger: (userId: string, trigger: string | null) =>
    request<{ ok: boolean; pending_trigger: string | null }>('/api/chatbot/treatment/debug-trigger', {
      method: 'PUT',
      body: JSON.stringify({ user_id: userId, trigger }),
    }),

  setCompanionName: (name: string, userId = 'default_user') =>
    request<{ ok: boolean; companion_name: string }>('/api/chatbot/companion-name', {
      method: 'PUT',
      body: JSON.stringify({ user_id: userId, companion_name: name }),
    }),

  // --- Supporters ---
  getSupporters: (userId = 'default_user') =>
    request<Supporter[]>(`/api/supporters?user_id=${userId}`),

  createSupporter: (data: { name: string; relationship?: string; notes?: string }, userId = 'default_user') =>
    request<Supporter>('/api/supporters', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, ...data }),
    }),

  updateSupporter: (id: string, data: { name?: string; relationship?: string; notes?: string }) =>
    request<Supporter>(`/api/supporters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSupporter: (id: string) =>
    request<{ ok: boolean }>(`/api/supporters/${id}`, { method: 'DELETE' }),

  getActivitySupporters: (plannedActivityId: string) =>
    request<PlannedActivitySupporter[]>(`/api/supporters/planned/${plannedActivityId}`),

  addActivitySupporter: (plannedActivityId: string, supporterId: string, helpDescription?: string) =>
    request<PlannedActivitySupporter>(`/api/supporters/planned/${plannedActivityId}`, {
      method: 'POST',
      body: JSON.stringify({ supporter_id: supporterId, help_description: helpDescription }),
    }),

  removeActivitySupporter: (plannedActivityId: string, supporterId: string) =>
    request<{ ok: boolean }>(`/api/supporters/planned/${plannedActivityId}/${supporterId}`, {
      method: 'DELETE',
    }),

  // --- Auth ---
  unlock: (userId: string, participantCode: string, inviteCode: string) =>
    request<{ ok: boolean; message: string; participant_code?: string; is_unlocked: boolean }>(
      '/api/auth/unlock',
      {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, participant_code: participantCode, invite_code: inviteCode }),
      }
    ),

  getUnlockStatus: (userId: string) =>
    request<{ is_unlocked: boolean; participant_code: string | null }>(`/api/auth/status?user_id=${userId}`),
};
