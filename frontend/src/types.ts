export interface AudioUploadResponse {
  audio_record_id: string;
  transcript: string;
  file_size_bytes?: number;
  whisper_error?: string;
}

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
  ai_immediate_feedback: string;
  risk_level: 'safe' | 'mild' | 'high' | 'crisis';
  confirmed: boolean;
}

export interface Supporter {
  id: string;
  user_id: string;
  name: string;
  relationship?: string;
  notes?: string;
  created_at: string;
}

export interface PlannedActivitySupporter {
  id: string;
  planned_activity_id: string;
  supporter_id: string;
  help_description?: string;
  created_at: string;
  supporter_name?: string;
  supporter_relationship?: string;
}

export interface DomainRadarItem {
  domain_id: string | null;  // null = "其他"
  domain_name: string;
  count: number;
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

export interface ChatSession {
  id: number;
  title: string | null;
  created_at: string;
  preview: string | null;
}

export interface ChatResponse {
  reply: string;
  is_crisis: boolean;
  detected_activity: { type: 'completed' | 'planned'; name: string } | null;
  phase_step?: number | null;
  free_chat_route?: {
    primary_mode: string;
    secondary_modes: string[];
    confidence: number;
    reason: string;
  } | null;
}

export interface TreatmentCriterion {
  key: string;
  label: string;
  done: boolean;
  current?: number;
  target?: number;
}

export interface TreatmentProgressData {
  phase: 'intro' | 'setup' | 'first_review' | 'review_cycle';
  phase_label: string;
  review_cycle_count: number;
  phase_days: number;
  days_required: number | null;
  days_until_eligible: number;
  criteria: TreatmentCriterion[];
  criteria_met: boolean;
  tasks_required?: boolean;
  can_advance: boolean;
  manual_advance_enabled: boolean;
  active_trigger?: string | null;
  recently_triggered?: string[];
  phase_session_done?: boolean;
  phase_scatter_start_date?: string | null;
  phase_scatter_end_date?: string | null;
}

export interface UserState {
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
    pleasure_score?: number;
    importance_score?: number;
    activity?: string;
    thought?: string;
    planned_activity_id?: string;
  }[];
  count: number;
  avg_pleasure?: number;
  avg_importance?: number;
  daily_mood_score?: number | null;
}

export interface DailyDataPoint {
  date: string;
  avg_pleasure?: number;
  avg_importance?: number;
  count: number;
  daily_mood_score?: number;
}

export interface WeekStats {
  daily_data: DailyDataPoint[];
  total_count: number;
  avg_pleasure?: number;
  avg_importance?: number;
}

export interface MonthStats {
  daily_data: DailyDataPoint[];
  total_count: number;
  avg_pleasure?: number;
  avg_importance?: number;
}
