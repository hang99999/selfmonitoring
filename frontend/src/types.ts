export interface MoodRecord {
  id: string;
  user_id: string;
  timestamp: string;
  raw_text: string;
  activity: string;
  thought: string;
  pleasure_score?: number;
  importance_score?: number;
  planned_activity_id?: string;
  life_domain_id?: string | null;  // null = "其他"
  emotion_type: string;
  emotion_intensity: number;
  ai_immediate_feedback: string;
  risk_level: 'safe' | 'mild' | 'high' | 'crisis';
  confirmed: boolean;
}

export interface DomainRadarItem {
  domain_id: string | null;  // null = "其他"
  domain_name: string;
  count: number;
}

export interface InsightReport {
  id: string;
  report_type: 'daily' | 'weekly';
  generated_at: string;
  content: string;
  patterns: EmotionPattern[];
  cbt_suggestions: string[];
}

export interface EmotionPattern {
  trigger: string;
  emotion: string;
  frequency: number;
  insight: string;
}

export interface LifeDomain {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Value {
  id: string;
  user_id: string;
  life_domain_id: string;
  content: string;
  created_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  value_id?: string;
  life_domain_id?: string;
  name: string;
  difficulty_rank?: number;
  is_in_library: boolean;
  created_at: string;
}

export interface PlannedActivity {
  id: string;
  user_id: string;
  activity_id?: string;
  activity_name: string;
  life_domain_id?: string;
  value_id?: string;
  scheduled_date: string;
  scheduled_time?: string;
  completed: boolean;
  completion_record_id?: string;
  created_at: string;
}

export interface DailyMood {
  id: string;
  user_id: string;
  date: string;
  mood_score: number;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  is_crisis: boolean;
  detected_activity: { type: 'completed' | 'planned'; name: string } | null;
}

export interface UserState {
  companion_name: string;
  days_since_registration: number;
  is_first_conversation: boolean;
  total_records_this_week: number;
  avg_daily_records: number;
  avg_enjoyment_score: number | null;
  avg_importance_score: number | null;
  today_planned_activities: string[];
  today_completed_activities: string[];
  today_recorded_activities: string[];
  today_mood: number | null;
  active_triggers: string[];
}

export interface DayStats {
  records: {
    timestamp: string;
    emotion_type: string;
    emotion_intensity: number;
    pleasure_score?: number;
    importance_score?: number;
    activity?: string;
    thought?: string;
  }[];
  count: number;
  avg_intensity: number;
  avg_pleasure?: number;
  avg_importance?: number;
}

export interface DailyDataPoint {
  date: string;
  avg_intensity: number;
  avg_pleasure?: number;
  avg_importance?: number;
  count: number;
  dominant_emotion: string;
  daily_mood_score?: number;
}

export interface WeekStats {
  daily_data: DailyDataPoint[];
  total_count: number;
  emotion_distribution: Record<string, number>;
  avg_intensity: number;
  avg_pleasure?: number;
  avg_importance?: number;
}

export interface MonthStats {
  daily_data: DailyDataPoint[];
  total_count: number;
  emotion_distribution: Record<string, number>;
  avg_intensity: number;
  avg_pleasure?: number;
  avg_importance?: number;
}
