export interface Project {
  id: string;
  name: string;
  keyword: string;
  description?: string;
  status: 'active' | 'archived';
  sampling_config: SamplingConfig;
  created_at: string;
  updated_at: string;
}

export interface SamplingConfig {
  high_likes_threshold: number;
  high_likes_retention: number;
  mid_likes_retention: number;
  low_likes_retention: number;
  batch_size: number;
}

export type AigcType = 'ai_restore' | 'ai_image' | 'digital_human' | 'ai_dub' | 'documentary' | 'drama' | 'other';

export const AIGC_TYPE_LABELS: Record<AigcType, string> = {
  ai_restore: 'AI影像修复',
  ai_image: 'AI生成图像',
  digital_human: '数字人讲述',
  ai_dub: 'AI配音',
  documentary: '传统纪录片',
  drama: '情景剧',
  other: '其他',
};

export interface Post {
  id: string;
  project_id: string;
  platform: 'xhs' | 'bilibili';
  title?: string;
  content?: string;
  description?: string;
  author_id_hash?: string;
  author_name_mask?: string;
  creator_name?: string;
  likes: number;
  view_count: number;
  comments_count: number;
  shares: number;
  is_aigc: boolean;
  aigc_type?: AigcType;
  narrative_type?: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
  url: string;
  publish_time?: string;
  collected_at: string;
  collected_by?: string;
  analysis_status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface Comment {
  id: string;
  post_id: string;
  project_id: string;
  text: string;
  likes: number;
  sampling_tier: 'high' | 'mid' | 'low';
  is_sampled: boolean;
  analysis: AnalysisResult | null;
  is_empty: boolean;
  is_offensive: boolean;
  is_ad: boolean;
  is_irrelevant: boolean;
  human_corrected: Partial<AnalysisResult> | null;
  created_at: string;
  source_tool?: string;
  source_url?: string;
  content_hash?: string;
}

export interface AnalysisResult {
  d1: number | null;
  d2_valence: number | null;
  d2_arousal: number | null;
  d3: number | null;
  d4: number | null;
  d5: number | null;
  d6: number | null;
  narrative_type: string | null;
  labov_weights: number[] | null;
  risk_level: 'safe' | 'low' | 'medium' | 'high' | null;
  evidence_keywords: EvidenceKeyword[];
  model_version?: string;
}

export interface EvidenceKeyword {
  word: string;
  weight: number;
  dimension: string;
}

export interface AnalysisLog {
  id: string;
  project_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress_percent: number;
  total_comments: number;
  processed_comments: number;
  failed_comments: number;
  token_consumed: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface Report {
  id: string;
  project_id: string;
  report_type: 'weekly' | 'monthly' | 'event' | 'thesis_package';
  title: string;
  content: string;
  data_snapshot?: Record<string, unknown>;
  created_at: string;
}

// Chart data types
export interface ScatterDataPoint {
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  commentId: string;
}

export interface RadarData {
  dimensions: string[];
  values: number[];
  label: string;
  color: string;
}

export interface SunburstNode {
  name: string;
  value?: number;
  children?: SunburstNode[];
  itemStyle?: { color: string };
}

export interface HeatmapData {
  x: string;
  y: string;
  value: number;
}

// Statistics types
export interface TTestResult {
  t: number;
  p: number;
  df: number;
  cohensD: number;
  mean1: number;
  mean2: number;
  significance: '***' | '**' | '*' | '?' | 'ns';
}

export interface DimensionStats {
  dimension: string;
  label: string;
  groupA: number[];
  groupB: number[];
  result: TTestResult;
}

// Filter state
export interface FilterState {
  platform: 'all' | 'xhs' | 'bilibili';
  timeRange: '7d' | '30d' | '90d' | 'custom';
  contentType: 'all' | 'aigc' | 'human';
  narrativeTypes: string[];
  sentiment: 'all' | 'positive' | 'neutral' | 'negative';
  riskLevel: 'all' | 'safe' | 'low' | 'medium' | 'high';
}

// Demo data marker
export interface DemoProject {
  id: string;
  name: string;
  posts: Post[];
  comments: Comment[];
}

// Local collection log
export interface LocalLog {
  id: string;
  platform: 'xhs' | 'bilibili';
  keyword: string;
  source_tool: string;
  config_json?: Record<string, unknown>;
  raw_count: number;
  clean_count: number;
  import_count: number;
  duplicate_count: number;
  data_file_path?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  operator: string;
  created_at: string;
  completed_at?: string;
}
