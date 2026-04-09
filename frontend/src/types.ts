export interface MoodRecord {
  id: string;
  user_id: string;
  timestamp: string;
  raw_text: string;
  activity: string;
  thought: string;
  // BA 核心：愉悦度与重要性双维度评分
  pleasure_score?: number;
  importance_score?: number;
  planned_activity_id?: string;
  emotion_type: string;
  emotion_intensity: number;
  voice_valence?: number;
  voice_arousal?: number;
  combined_emotion_score?: number;
  ai_immediate_feedback: string;
  risk_level: 'safe' | 'mild' | 'high' | 'crisis';
  cognitive_distortion?: string;
  confirmed: boolean;
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

// --- Activity Library Types (BATD-R Form 2 & 3) ---

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
  scheduled_date: string;   // YYYY-MM-DD
  scheduled_time?: string;  // HH:MM
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

// --- Chatbot Types ---

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

// --- Stats Types ---

export interface DayStats {
  records: {
    timestamp: string;
    emotion_type: string;
    emotion_intensity: number;
    pleasure_score?: number;
    importance_score?: number;
    activity?: string;
  }[];
  count: number;
  avg_intensity: number;
  avg_pleasure?: number;
  avg_importance?: number;
}

export interface WeekStats {
  daily_data: {
    date: string;
    avg_intensity: number;
    avg_pleasure?: number;
    avg_importance?: number;
    count: number;
    dominant_emotion: string;
    daily_mood_score?: number;
  }[];
  total_count: number;
  emotion_distribution: Record<string, number>;
  avg_intensity: number;
  avg_pleasure?: number;
  avg_importance?: number;
}

export interface MonthStats {
  daily_data: {
    date: string;
    avg_intensity: number;
    avg_pleasure?: number;
    avg_importance?: number;
    count: number;
    dominant_emotion: string;
  }[];
  total_count: number;
  emotion_distribution: Record<string, number>;
  avg_intensity: number;
  avg_pleasure?: number;
  avg_importance?: number;
}
