export type Industry = {
  industry_key?: string;
  key?: string;
  name: string;
  competitors: string[];
  dimensions: string[];
  description?: string;
  representative_products?: Record<string, string[]>;
};

export type StartAnalysisRequest = {
  target_platform: string;
  competitors: string[];
  analysis_scene: string;
  target_user: string;
  time_range: string;
  focus_dimensions: string[];
  industry_key: string;
};

export type StartAnalysisResponse = {
  task_id: string;
};

export type AnalysisStatus = {
  task_id?: string;
  status?: string;
  progress?: number;
  current_agent?: string;
  message?: string;
  error?: string;
};

export type EvidenceItem = {
  evidence_id: string;
  platform: string;
  claim: string;
  source_type: string;
  source_title: string;
  source_url: string;
  publish_time?: string;
  collected_time?: string;
  credibility: "high" | "medium" | "low" | string;
  related_dimension: string;
  raw_content: string;
  confidence_score?: number;
};

export type Claim = {
  claim_id: string;
  content: string;
  dimension: string;
  related_platforms: string[];
  evidence_ids: string[];
  confidence_score: number;
  generated_by: string;
};

export type AgentTrace = {
  step_id?: number;
  agent_name: string;
  status: string;
  input_summary?: string;
  output_summary?: string;
  duration_ms?: number;
  error?: string | null;
};

export type QualityResult = {
  approved?: boolean;
  score?: number;
  status?: string;
  quality_score?: number;
  reason?: string;
  reject_to?: string | null;
  target_agent?: string | null;
  reject_reason?: string | null;
  missing_dimensions?: string[];
  missing_platforms?: string[];
  required_actions?: string[];
  required_fix?: string;
  checked_items?: Record<string, boolean>;
  passed_checks?: string[];
  failed_checks?: string[];
};

export type Metrics = {
  evidence_count?: number;
  claim_count?: number;
  citation_rate?: number;
  coverage_rate?: number;
  high_credibility_ratio?: number;
  low_credibility_ratio?: number;
  quality_score?: number;
  iteration_count?: number;
};

export type RiskFlag = {
  risk_type: string;
  description: string;
  severity: "low" | "medium" | "high" | string;
  related_platforms?: string[];
  related_dimensions?: string[];
};

export type ArtifactsSummary = {
  task_id: string;
  raw_research_count?: number;
  evidence_count?: number;
  claim_count?: number;
  risk_count?: number;
  trace_count?: number;
  has_product_matrix?: boolean;
  has_business_matrix?: boolean;
  has_final_report?: boolean;
};

export type FinalReport = Record<string, any>;
