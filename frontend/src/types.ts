export interface MoodRecord {
  id: string;
  timestamp: string;
  raw_text: string;
  activity: string;
  thought: string;
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

export interface DayStats {
  records: { timestamp: string; emotion_type: string; emotion_intensity: number }[];
  count: number;
  avg_intensity: number;
}

export interface WeekStats {
  daily_data: { date: string; avg_intensity: number; count: number; dominant_emotion: string }[];
  total_count: number;
  emotion_distribution: Record<string, number>;
  avg_intensity: number;
}

export interface MonthStats {
  daily_data: { date: string; avg_intensity: number; count: number; dominant_emotion: string }[];
  total_count: number;
  emotion_distribution: Record<string, number>;
  avg_intensity: number;
}
