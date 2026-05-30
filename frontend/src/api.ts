import type {
  MoodRecord, DayStats, WeekStats, MonthStats,
  LifeDomain, Value, Activity, PlannedActivity, DailyMood,
  ChatMessage, ChatSession, ChatResponse, UserState, DomainRadarItem,
  TreatmentProgressData, Supporter, PlannedActivitySupporter,
  AudioUploadResponse, AssessmentResult, RecordSubmissionStatus,
} from './types';
import { AppLanguage, getStoredLanguage } from './i18n';

// ── 后端地址 ────────────────────────────────────────────────────────────────
// 开发时手机和电脑在同一 WiFi 下，指向电脑局域网 IP
const DEFAULT_API_BASE = 'https://api.warmsteps.xyz';
const BASE = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE;

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const language = await getStoredLanguage();
  const res = await fetch(`${BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Language': language,
      ...((options?.headers as Record<string, string> | undefined) ?? {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}

export function isAiAccessRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('AI_ACCESS_REQUIRED');
}

export function isSubmissionProcessingError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('SUBMISSION_PROCESSING');
}

export const api = {
  // --- Records ---
  submitRecord: (
    text: string,
    userId = 'default_user',
    plannedActivityId?: string,
    quickFields?: { activity: string; pleasure_score: number; importance_score: number },
    audioRecordId?: string,
    clientSubmissionId?: string,
  ) =>
    request<MoodRecord>('/api/record/submit', {
      method: 'POST',
      body: JSON.stringify({
        text,
        user_id: userId,
        planned_activity_id: plannedActivityId,
        ...(clientSubmissionId ? { client_submission_id: clientSubmissionId } : {}),
        ...(audioRecordId ? { audio_record_id: audioRecordId } : {}),
        ...quickFields,
      }),
    }),

  getRecordSubmission: (clientSubmissionId: string, userId = 'default_user') =>
    request<RecordSubmissionStatus>(
      `/api/record/submission/${encodeURIComponent(clientSubmissionId)}?user_id=${encodeURIComponent(userId)}`,
    ),

  submitManualRecord: (data: {
    activity: string;
    thought?: string;
    pleasure_score: number;
    importance_score: number;
    life_domain_id?: string | null;
    planned_activity_id?: string;
    user_id?: string;
  }) =>
    request<MoodRecord>('/api/record/manual', {
      method: 'POST',
      body: JSON.stringify({ user_id: 'default_user', ...data }),
    }),

  uploadAudio: async (fileUri: string, userId = 'default_user'): Promise<AudioUploadResponse> => {
    const language = await getStoredLanguage();
    const lowerUri = fileUri.toLowerCase();
    const isWav = lowerUri.includes('.wav');
    const isM4a = lowerUri.includes('.m4a');
    const name = isWav ? 'audio.wav' : isM4a ? 'audio.m4a' : 'audio.wav';
    const type = isWav ? 'audio/wav' : isM4a ? 'audio/mp4' : 'audio/wav';

    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name,
      type,
    } as any);
    formData.append('user_id', userId);
    const res = await fetch(`${BASE}/api/audio/upload`, {
      method: 'POST',
      headers: { 'X-App-Language': language },
      body: formData,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`API ${res.status}: ${detail || res.statusText}`);
    }
    return res.json();
  },

  confirmRecord: (id: string, updates?: {
    activity?: string;
    thought?: string;
    pleasure_score?: number;
    importance_score?: number;
    life_domain_id?: string | null;
  }) =>
    request<MoodRecord>(`/api/record/${id}/confirm`, {
      method: 'PUT',
      body: JSON.stringify(updates || {}),
    }),

  listRecords: (date?: string, userId = 'default_user', limit = 50) => {
    const params = new URLSearchParams({ user_id: userId });
    if (date) params.set('date', date);
    params.set('limit', String(limit));
    return request<MoodRecord[]>(`/api/record/list?${params}`);
  },

  listRecordsRange: (startDate: string, endDate: string, userId = 'default_user', limit = 200) => {
    const params = new URLSearchParams({
      user_id: userId,
      start_date: startDate,
      end_date: endDate,
      limit: String(limit),
    });
    return request<MoodRecord[]>(`/api/record/list?${params}`);
  },

  getRecord: (id: string) =>
    request<MoodRecord>(`/api/record/${id}`),

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

  listPlannedRange: (startDate: string, endDate: string, userId = 'default_user') => {
    const params = new URLSearchParams({
      user_id: userId,
      start_date: startDate,
      end_date: endDate,
    });
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

  // --- Assessments ---
  saveAssessmentResult: (data: {
    scale_type: string;
    score: number;
    display_score?: number;
    severity_level?: string;
    answers: number[];
    user_id?: string;
  }) =>
    request<AssessmentResult>('/api/assessments', {
      method: 'POST',
      body: JSON.stringify({ user_id: 'default_user', ...data }),
    }),

  listAssessmentResults: (userId = 'default_user', scaleType?: string, limit = 50) => {
    const params = new URLSearchParams({ user_id: userId, limit: String(limit) });
    if (scaleType) params.set('scale_type', scaleType);
    return request<AssessmentResult[]>(`/api/assessments?${params}`);
  },

  // --- Chatbot ---
  getChatbotState: (userId = 'default_user') =>
    request<UserState>(`/api/chatbot/state?user_id=${userId}`),

  createChatSession: (userId = 'default_user') =>
    request<{ id: number; title: string | null; created_at: string }>(
      `/api/chatbot/session?user_id=${userId}`,
      { method: 'POST' },
    ),

  getCurrentSession: (userId = 'default_user', intent?: string) => {
    const params = new URLSearchParams({ user_id: userId });
    if (intent) params.set('intent', intent);
    return request<{ id: number; title: string | null; created_at: string; phase_step?: number; session_intent?: string | null } | null>(
      `/api/chatbot/session/current?${params}`,
    );
  },

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
    request<{
      is_unlocked: boolean;
      participant_code: string | null;
      plan_type?: string;
      premium_until?: string | null;
      entitlement_source?: string | null;
      language?: AppLanguage;
    }>(`/api/auth/status?user_id=${userId}`),

  setLanguage: (userId: string, language: AppLanguage) =>
    request<{ ok: boolean; language: AppLanguage }>('/api/auth/language', {
      method: 'PUT',
      body: JSON.stringify({ user_id: userId, language }),
    }),
};
