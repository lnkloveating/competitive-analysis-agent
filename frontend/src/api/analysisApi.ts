import { apiGet, apiPost } from "./client";
import type {
  Industry,
  StartAnalysisRequest,
  StartAnalysisResponse,
  AnalysisStatus,
  EvidenceItem,
  Claim,
  AgentTrace,
  QualityResult,
  Metrics,
  RiskFlag,
  ArtifactsSummary,
  FinalReport,
} from "../types/analysis";

export const analysisApi = {
  health: () => apiGet<{ status: string }>("/health"),

  getIndustries: () =>
    apiGet<{ industries?: Industry[] } | Industry[]>("/api/industries"),

  startAnalysis: (payload: StartAnalysisRequest) =>
    apiPost<StartAnalysisResponse>("/api/analysis/start", payload),

  getStatus: (taskId: string) =>
    apiGet<AnalysisStatus>(`/api/analysis/${taskId}/status`),

  getReport: (taskId: string) =>
    apiGet<{ task_id?: string; final_report?: FinalReport } | FinalReport>(
      `/api/analysis/${taskId}/report`,
    ),

  getEvidence: (taskId: string) =>
    apiGet<{ task_id: string; evidence_list: EvidenceItem[] }>(
      `/api/analysis/${taskId}/evidence`,
    ),

  getClaims: (taskId: string) =>
    apiGet<{ task_id: string; claims: Claim[] }>(
      `/api/analysis/${taskId}/claims`,
    ),

  getTrace: (taskId: string) =>
    apiGet<{ task_id: string; trace_log: AgentTrace[] }>(
      `/api/analysis/${taskId}/trace`,
    ),

  getQuality: (taskId: string) =>
    apiGet<{
      task_id: string;
      quality_result: QualityResult;
      is_approved?: boolean;
      iteration_count?: number;
      rejected_agents?: string[];
      needs_human_review?: boolean;
      quality_status?: string;
    }>(`/api/analysis/${taskId}/quality`),

  getMetrics: (taskId: string) =>
    apiGet<{ task_id: string; metrics: Metrics }>(
      `/api/analysis/${taskId}/metrics`,
    ),

  getRisks: (taskId: string) =>
    apiGet<{ task_id: string; risk_flags: RiskFlag[] }>(
      `/api/analysis/${taskId}/risks`,
    ),

  getArtifacts: (taskId: string) =>
    apiGet<ArtifactsSummary>(`/api/analysis/${taskId}/artifacts`),
};
