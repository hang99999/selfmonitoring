const BASE = '';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  submitRecord: (text: string, userId = 'default_user') =>
    request<import('./types').MoodRecord>('/api/record/submit', {
      method: 'POST',
      body: JSON.stringify({ text, user_id: userId }),
    }),

  confirmRecord: (id: string, updates?: Partial<Pick<import('./types').MoodRecord, 'activity' | 'thought' | 'emotion_type' | 'emotion_intensity'>>) =>
    request<import('./types').MoodRecord>(`/api/record/${id}/confirm`, {
      method: 'PUT',
      body: JSON.stringify(updates || {}),
    }),

  listRecords: (date?: string, userId = 'default_user') => {
    const params = new URLSearchParams({ user_id: userId });
    if (date) params.set('date', date);
    return request<import('./types').MoodRecord[]>(`/api/record/list?${params}`);
  },

  getRecord: (id: string) =>
    request<import('./types').MoodRecord>(`/api/record/${id}`),

  getDailyInsight: (userId = 'default_user', date?: string) => {
    const params = new URLSearchParams({ user_id: userId });
    if (date) params.set('date', date);
    return request<import('./types').InsightReport>(`/api/insight/daily?${params}`);
  },

  getWeeklyInsight: (userId = 'default_user') =>
    request<import('./types').InsightReport>(`/api/insight/weekly?user_id=${userId}`),

  getStatsToday: (userId = 'default_user') =>
    request<import('./types').DayStats>(`/api/stats/today?user_id=${userId}`),

  getStatsWeek: (userId = 'default_user') =>
    request<import('./types').WeekStats>(`/api/stats/week?user_id=${userId}`),

  getStatsMonth: (userId = 'default_user') =>
    request<import('./types').MonthStats>(`/api/stats/month?user_id=${userId}`),
};
