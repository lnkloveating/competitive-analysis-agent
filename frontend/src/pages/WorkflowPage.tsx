import { Fragment, useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { StatusBadge } from "../components/common/StatusBadge";
import { Tooltip } from "../components/common/Tooltip";
import { analysisApi } from "../api/analysisApi";
import { getAgentRole } from "../utils/labels";
import type {
  AgentTrace,
  AnalysisStatus,
  ArtifactsSummary,
  ContextSummary,
  ErrorLogItem,
  Metrics,
  QualityResult,
  ReviewTicket,
} from "../types/analysis";

type WorkflowPageProps = {
  taskId?: string;
  displayTaskId?: string;
  onNavigate: (key: string) => void;
  autoDemoActive?: boolean;
};

type AgentStatus =
  | "pending"
  | "running"
  | "success"
  | "rejected"
  | "failed"
  | "required";

type AgentNode = {
  name: string;
  label: string;
  subtitle: string;
};

type QualityPayload = {
  task_id?: string;
  quality_result?: QualityResult;
  is_approved?: boolean;
  iteration_count?: number;
  rejected_agents?: string[];
  needs_human_review?: boolean;
  quality_status?: string;
  review_ticket?: ReviewTicket;
};

type WorkflowTrace = AgentTrace & {
  timestamp?: string;
  time?: string;
  created_at?: string;
  current_agent?: string;
  reject_to?: string | null;
  target_agent?: string | null;
  reject_reason?: string | null;
  reason?: string | null;
  required_actions?: string[];
  context_selected_evidence_count?: number;
  context_trimmed_evidence_count?: number;
  review_ticket_id?: string;
};

const agentNodes: AgentNode[] = [
  {
    name: "ResearchAgent",
    label: "调研",
    subtitle: "公开信息采集",
  },
  {
    name: "EvidenceAgent",
    label: "证据",
    subtitle: "证据抽取",
  },
  {
    name: "ProductAgent",
    label: "产品",
    subtitle: "产品矩阵",
  },
  {
    name: "BusinessAgent",
    label: "商业",
    subtitle: "商业矩阵",
  },
  {
    name: "VerificationAgent",
    label: "校验",
    subtitle: "忠实性校验",
  },
  {
    name: "RiskAgent",
    label: "风险",
    subtitle: "风险识别",
  },
  {
    name: "QualityAgent",
    label: "质检",
    subtitle: "质量门控",
  },
  {
    name: "StrategyAgent",
    label: "策略",
    subtitle: "最终报告",
  },
];

const AGENT_SCORE_CONTRIBUTIONS: Record<string, string> = {
  ResearchAgent: "确认产品身份与本地事实，未来接入爬虫补官网/评测/实时价格。",
  EvidenceAgent: "把规格、来源和字段可信度整理成可引用证据。",
  ProductAgent: "生成基础硬件快评、模具识别和点击系统判断；体验适配等待爬虫。",
  BusinessAgent: "产品对比模式下让位于硬件决策；未来可承接价格/渠道数据。",
  VerificationAgent: "检查购买建议是否有 evidence 支撑。",
  RiskAgent: "标记口碑、实时价格、长期可靠性等待验证项。",
  QualityAgent: "检查证据覆盖和风险严重度，输出报告可信度。",
  StrategyAgent: "把基础快评、证据链和风险项整合成最终购买建议。",
  HumanReviewRequired: "自动审查失败时等待人工复核。",
};

const humanReviewNode: AgentNode = {
  name: "HumanReviewRequired",
  label: "人工审核",
  subtitle: "Human Review · 质量门控未通过时进入人工复核",
};

const statusTone: Record<AgentStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  pending: "neutral",
  running: "info",
  success: "success",
  rejected: "warning",
  failed: "danger",
  required: "warning",
};

const statusLabel: Record<AgentStatus, string> = {
  pending: "等待中",
  running: "执行中",
  success: "已完成",
  rejected: "已打回",
  failed: "执行失败",
  required: "待人工审核",
};

const nodeClasses: Record<AgentStatus, string> = {
  pending: "border-white/10 bg-slate-900/55 text-slate-300",
  running:
    "border-cyan-300/55 bg-cyan-300/10 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.18)]",
  success:
    "border-emerald-400/45 bg-emerald-400/10 text-emerald-100 shadow-[0_0_24px_rgba(52,211,153,0.12)]",
  rejected:
    "border-amber-400/50 bg-amber-400/10 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.12)]",
  failed:
    "border-rose-400/55 bg-rose-500/10 text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.14)]",
  required:
    "border-amber-300/60 bg-amber-400/10 text-amber-100 shadow-[0_0_26px_rgba(251,191,36,0.16)]",
};

function normalizeTrace(traceLog: unknown): WorkflowTrace[] {
  if (!Array.isArray(traceLog)) {
    return [];
  }

  return traceLog
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      step_id: typeof item.step_id === "number" ? item.step_id : undefined,
      agent_name: typeof item.agent_name === "string" ? item.agent_name : "未知Agent",
      status: typeof item.status === "string" ? item.status : "pending",
      input_summary: typeof item.input_summary === "string" ? item.input_summary : undefined,
      output_summary: typeof item.output_summary === "string" ? item.output_summary : undefined,
      duration_ms: typeof item.duration_ms === "number" ? item.duration_ms : undefined,
      context_selected_evidence_count:
        typeof item.context_selected_evidence_count === "number"
          ? item.context_selected_evidence_count
          : undefined,
      context_trimmed_evidence_count:
        typeof item.context_trimmed_evidence_count === "number"
          ? item.context_trimmed_evidence_count
          : undefined,
      review_ticket_id:
        typeof item.review_ticket_id === "string" ? item.review_ticket_id : undefined,
      error:
        typeof item.error === "string" || item.error === null
          ? item.error
          : undefined,
      timestamp: typeof item.timestamp === "string" ? item.timestamp : undefined,
      time: typeof item.time === "string" ? item.time : undefined,
      created_at: typeof item.created_at === "string" ? item.created_at : undefined,
      current_agent:
        typeof item.current_agent === "string" ? item.current_agent : undefined,
      reject_to:
        typeof item.reject_to === "string" || item.reject_to === null
          ? item.reject_to
          : undefined,
      target_agent:
        typeof item.target_agent === "string" || item.target_agent === null
          ? item.target_agent
          : undefined,
      reject_reason:
        typeof item.reject_reason === "string" || item.reject_reason === null
          ? item.reject_reason
          : undefined,
      reason:
        typeof item.reason === "string" || item.reason === null
          ? item.reason
          : undefined,
      required_actions: Array.isArray(item.required_actions)
        ? item.required_actions.filter(
            (action): action is string => typeof action === "string",
          )
        : undefined,
    }));
}

function normalizeStatus(value?: string): string {
  return (value || "").toLowerCase();
}

function buildLatestTraceMap(traceLog: WorkflowTrace[]) {
  return traceLog.reduce<Record<string, WorkflowTrace>>((acc, trace) => {
    if (trace.agent_name) {
      acc[trace.agent_name] = trace;
    }
    return acc;
  }, {});
}

function buildTraceHistoryMap(traceLog: WorkflowTrace[]) {
  return traceLog.reduce<Record<string, WorkflowTrace[]>>((acc, trace) => {
    if (trace.agent_name) {
      acc[trace.agent_name] = [...(acc[trace.agent_name] ?? []), trace];
    }

    return acc;
  }, {});
}

function deriveAgentStatus(
  agentName: string,
  latestTrace: WorkflowTrace | undefined,
  status: AnalysisStatus | null,
): AgentStatus {
  const traceStatus = normalizeStatus(latestTrace?.status);

  if (traceStatus === "success") {
    return "success";
  }

  if (traceStatus === "rejected") {
    return "rejected";
  }

  if (traceStatus === "failed" || traceStatus === "schema_failed") {
    return "failed";
  }

  if (traceStatus === "started") {
    return "running";
  }

  const taskStatus = normalizeStatus(status?.status);
  if (status?.current_agent === agentName && taskStatus !== "completed") {
    return "running";
  }

  return "pending";
}

function asList(value: string[] | undefined, fallback?: string): string[] {
  if (Array.isArray(value) && value.length > 0) {
    return value;
  }

  return fallback ? [fallback] : [];
}

function statusIcon(status: AgentStatus) {
  if (status === "success") {
    return "✓";
  }

  if (status === "rejected" || status === "required") {
    return "!";
  }

  if (status === "failed") {
    return "×";
  }

  if (status === "running") {
    return "";
  }

  return "•";
}

function AgentCard({
  badges = [],
  agent,
  index,
  isSelected,
  onSelect,
  status,
  produce,
  contribution,
}: {
  badges?: Array<{
    label: string;
    tone?: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
  agent: AgentNode;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  status: AgentStatus;
  produce: string;
  contribution: string;
}) {
  return (
    <Tooltip
      className="block w-full"
      width={250}
      content={
        <span className="space-y-1">
          <span className="block text-sm font-semibold text-slate-800">
            {agent.name}
          </span>
          <span className="block">
            <span className="text-slate-400">作用：</span>
            {getAgentRole(agent.name)}
          </span>
          <span className="block">
            <span className="text-slate-400">本次产出：</span>
            {produce}
          </span>
          <span className="block">
            <span className="text-slate-400">对最终建议：</span>
            {contribution}
          </span>
          <span className="block">
            <span className="text-slate-400">状态：</span>
            {statusLabel[status]}
          </span>
        </span>
      }
    >
      <button
        className={`workflow-node-enter min-h-32 w-full rounded-lg border p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/70 ${nodeClasses[status]} ${
          isSelected ? "ring-2 ring-cyan-300/60" : ""
        } ${status === "running" ? "workflow-node-pulse" : ""}`}
        onClick={onSelect}
        style={{ animationDelay: `${index * 90}ms` }}
        type="button"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Step {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-2 text-base font-semibold text-white">{agent.label}</h3>
            <p className="mt-1 text-xs text-slate-400">{agent.subtitle}</p>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-sm font-bold">
            {status === "running" ? (
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.9)]" />
            ) : (
              statusIcon(status)
            )}
          </span>
        </div>
        <div className="mt-4">
          <StatusBadge label={statusLabel[status]} tone={statusTone[status]} />
          {badges.length > 0 ? (
            <span className="ml-2 inline-flex flex-wrap gap-2">
              {badges.map((badge) => (
                <StatusBadge
                  key={badge.label}
                  label={badge.label}
                  tone={badge.tone ?? "neutral"}
                />
              ))}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">
          {contribution}
        </p>
      </button>
    </Tooltip>
  );
}

type FlowTone = "pending" | "success" | "running" | "reject" | "failed";

const flowLineClasses: Record<FlowTone, string> = {
  pending: "workflow-flow-line--pending",
  success: "workflow-flow-line--success",
  running: "workflow-flow-line",
  reject: "workflow-flow-line--reject",
  failed: "workflow-flow-line--failed",
};

function flowToneFromStatus(status: AgentStatus): FlowTone {
  if (status === "success") {
    return "success";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "rejected" || status === "required") {
    return "reject";
  }
  if (status === "failed") {
    return "failed";
  }
  return "pending";
}

function FlowConnector({ tone = "pending" }: { tone?: FlowTone }) {
  return (
    <div className="flex w-12 shrink-0 items-center justify-center">
      <span className={`h-0.5 w-full min-w-10 rounded-full ${flowLineClasses[tone]}`} />
    </div>
  );
}

function includesHumanReview(value?: string | null): boolean {
  return normalizeStatus(value ?? "").includes("human");
}

function traceTone(status?: string): "neutral" | "success" | "warning" | "danger" | "info" {
  const normalized = normalizeStatus(status);

  if (normalized === "success" || normalized === "approved") {
    return "success";
  }

  if (normalized === "rejected" || normalized.includes("human")) {
    return "warning";
  }

  if (normalized === "failed" || normalized === "schema_failed") {
    return "danger";
  }

  if (normalized === "started" || normalized === "running") {
    return "info";
  }

  return "neutral";
}

function getTraceTime(trace: WorkflowTrace): string | null {
  return trace.timestamp ?? trace.time ?? trace.created_at ?? null;
}

function latestStatusIsSuccessAfterReject(entries?: WorkflowTrace[]): boolean {
  if (!entries || entries.length < 2) {
    return false;
  }

  const latestStatus = normalizeStatus(entries[entries.length - 1]?.status);
  return (
    latestStatus === "success" &&
    entries.some((entry) => normalizeStatus(entry.status) === "rejected")
  );
}

export function WorkflowPage({
  taskId,
  displayTaskId,
  onNavigate,
  autoDemoActive = false,
}: WorkflowPageProps) {
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [traceLog, setTraceLog] = useState<WorkflowTrace[]>([]);
  const [qualityPayload, setQualityPayload] = useState<QualityPayload | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactsSummary | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [contextSummary, setContextSummary] = useState<Record<string, ContextSummary>>({});
  const [errorLog, setErrorLog] = useState<ErrorLogItem[]>([]);
  const [reviewTicket, setReviewTicket] = useState<ReviewTicket | null>(null);
  const [selectedAgentName, setSelectedAgentName] = useState("ResearchAgent");
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    setSelectedAgentName("ResearchAgent");
  }, [taskId]);

  useEffect(() => {
    if (!taskId) {
      setStatus(null);
      setTraceLog([]);
      setQualityPayload(null);
      setArtifacts(null);
      setMetrics(null);
      setContextSummary({});
      setErrorLog([]);
      setReviewTicket(null);
      setError(null);
      setLastUpdated(null);
      return;
    }

    const activeTaskId = taskId;
    let cancelled = false;
    let timerId: number | undefined;
    let inFlight = false;

    async function refreshWorkflow() {
      if (inFlight) {
        return;
      }

      inFlight = true;
      setIsRefreshing(true);

      const [statusResult, traceResult, qualityResult, artifactsResult, metricsResult] =
        await Promise.allSettled([
          analysisApi.getStatus(activeTaskId),
          analysisApi.getTrace(activeTaskId),
          analysisApi.getQuality(activeTaskId),
          analysisApi.getArtifacts(activeTaskId),
          analysisApi.getMetrics(activeTaskId),
        ]);

      if (cancelled) {
        inFlight = false;
        return;
      }

      const failedEndpoints: string[] = [];
      let nextStatus: AnalysisStatus | null = null;

      if (statusResult.status === "fulfilled") {
        nextStatus = statusResult.value;
        setStatus(statusResult.value);
      } else {
        failedEndpoints.push("status");
      }

      if (traceResult.status === "fulfilled") {
        setTraceLog(normalizeTrace(traceResult.value?.trace_log));
        setContextSummary(traceResult.value?.context_summary ?? {});
        setErrorLog(
          Array.isArray(traceResult.value?.error_log) ? traceResult.value.error_log : [],
        );
        setReviewTicket(traceResult.value?.review_ticket ?? null);
      } else {
        failedEndpoints.push("trace");
      }

      if (qualityResult.status === "fulfilled") {
        setQualityPayload(qualityResult.value);
        if (qualityResult.value?.review_ticket?.ticket_id) {
          setReviewTicket(qualityResult.value.review_ticket);
        }
      } else {
        failedEndpoints.push("quality");
      }

      if (artifactsResult.status === "fulfilled") {
        setArtifacts(artifactsResult.value);
      }

      if (metricsResult.status === "fulfilled") {
        setMetrics(metricsResult.value?.metrics ?? null);
      }

      setError(
        failedEndpoints.length > 0
          ? `无法刷新 ${failedEndpoints.join(", ")} 数据。`
          : null,
      );
      setLastUpdated(new Date());
      setIsInitialLoading(false);
      setIsRefreshing(false);
      inFlight = false;

      const taskStatus = normalizeStatus(nextStatus?.status);
      if ((taskStatus === "completed" || taskStatus === "failed") && timerId) {
        window.clearInterval(timerId);
        timerId = undefined;
      }
    }

    setIsInitialLoading(true);
    refreshWorkflow();
    timerId = window.setInterval(refreshWorkflow, 1800);

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, [taskId]);

  const qualityResult = qualityPayload?.quality_result;
  const qualityApproved =
    typeof qualityResult?.approved === "boolean"
      ? qualityResult.approved
      : typeof qualityPayload?.is_approved === "boolean"
        ? qualityPayload.is_approved
        : undefined;
  const requiredActions = asList(
    qualityResult?.required_actions,
    qualityResult?.required_fix,
  );
  const rejectTo = qualityResult?.reject_to ?? qualityResult?.target_agent ?? null;
  const rejectReason =
    qualityResult?.reject_reason ?? qualityResult?.reason ?? qualityResult?.status ?? null;
  const rejectedAgents = qualityPayload?.rejected_agents ?? [];
  const uniqueRejectedAgents = Array.from(new Set(rejectedAgents));
  const normalizedQualityStatus = normalizeStatus(
    qualityPayload?.quality_status ?? qualityResult?.status,
  );
  const hasHumanReviewTrace = traceLog.some((trace) => {
    return (
      includesHumanReview(trace.agent_name) ||
      includesHumanReview(trace.current_agent)
    );
  });
  const isHumanReviewRequired = Boolean(
    qualityPayload?.needs_human_review ||
      includesHumanReview(qualityPayload?.quality_status) ||
      includesHumanReview(qualityResult?.status) ||
      includesHumanReview(status?.current_agent) ||
      hasHumanReviewTrace,
  );
  const isQualityRejected = Boolean(
    rejectTo ||
      normalizedQualityStatus === "rejected" ||
      normalizedQualityStatus.includes("reject"),
  );
  const qualityFlowLabel = isHumanReviewRequired
    ? "进入人工审核"
      : isQualityRejected
        ? "质量打回"
      : qualityApproved === true || normalizedQualityStatus === "approved"
        ? "质量门控已通过"
        : "待审查";
  const qualityFlowTone: "neutral" | "success" | "warning" | "danger" | "info" =
    isHumanReviewRequired || isQualityRejected
      ? "warning"
      : qualityApproved === true || normalizedQualityStatus === "approved"
        ? "success"
        : "neutral";
  const latestTraceByAgent = useMemo(() => buildLatestTraceMap(traceLog), [traceLog]);
  const traceHistoryByAgent = useMemo(
    () => buildTraceHistoryMap(traceLog),
    [traceLog],
  );
  const visibleAgentNodes = isHumanReviewRequired
    ? [...agentNodes, humanReviewNode]
    : agentNodes;
  const derivedStatuses = visibleAgentNodes.reduce<Record<string, AgentStatus>>(
    (acc, agent) => {
      acc[agent.name] =
        agent.name === humanReviewNode.name
          ? "required"
          : agent.name === "QualityAgent" && isQualityRejected
            ? "rejected"
          : deriveAgentStatus(
              agent.name,
              latestTraceByAgent[agent.name],
              status,
            );
      return acc;
    },
    {},
  );
  const rerunAgents = useMemo(() => {
    return new Set(
      Object.entries(traceHistoryByAgent)
        .filter(([, entries]) => latestStatusIsSuccessAfterReject(entries))
        .map(([agentName]) => agentName),
    );
  }, [traceHistoryByAgent]);
  const contextEntries = useMemo(
    () =>
      Object.entries(contextSummary).filter(
        ([, summary]) => summary && typeof summary === "object",
      ),
    [contextSummary],
  );

  const selectedAgent =
    visibleAgentNodes.find((agent) => agent.name === selectedAgentName) ??
    visibleAgentNodes[0];
  const selectedTrace =
    latestTraceByAgent[selectedAgent.name] ??
    (selectedAgent.name === humanReviewNode.name
      ? latestTraceByAgent.HumanReviewRequired ?? latestTraceByAgent.HumanReviewAgent
      : undefined);
  const selectedStatus = derivedStatuses[selectedAgent.name] ?? "pending";
  const selectedRejectTo =
    selectedTrace?.reject_to ??
    selectedTrace?.target_agent ??
    (selectedAgent.name === "QualityAgent" ? rejectTo : null);
  const selectedRejectReason =
    selectedTrace?.reject_reason ??
    selectedTrace?.reason ??
    (selectedAgent.name === "QualityAgent" ? rejectReason : null);
  const selectedRequiredActions =
    selectedTrace?.required_actions ??
    (selectedAgent.name === "QualityAgent" ? requiredActions : []);
  function getNodeBadges(agentName: string) {
    const latestStatus = normalizeStatus(latestTraceByAgent[agentName]?.status);
    const wasRejectedByQuality = uniqueRejectedAgents.includes(agentName);

    return rerunAgents.has(agentName) ||
      (wasRejectedByQuality && latestStatus === "success")
      ? [{ label: "已重跑", tone: "warning" as const }]
      : [];
  }

  const qualityScore =
    qualityResult?.score ??
    qualityResult?.quality_score ??
    metrics?.quality_score;

  // 各 Agent 的"本次产出"摘要，尽量从已有 artifacts / metrics / quality / trace 读取。
  function getAgentProduce(agentName: string): string {
    const agentStatus = derivedStatuses[agentName] ?? "pending";
    const outputSummary = latestTraceByAgent[agentName]?.output_summary;

    switch (agentName) {
      case "ResearchAgent":
        return typeof artifacts?.raw_research_count === "number"
          ? `${artifacts.raw_research_count} 条原始调研记录`
          : outputSummary || "暂无";
      case "EvidenceAgent": {
        const count = artifacts?.evidence_count ?? metrics?.evidence_count;
        return typeof count === "number" ? `${count} 条结构化证据` : outputSummary || "暂无";
      }
      case "ProductAgent":
        return outputSummary ||
          (artifacts?.has_product_matrix ? "产品分析矩阵已生成" : "暂无");
      case "BusinessAgent":
        return outputSummary ||
          (artifacts?.has_business_matrix ? "商业分析矩阵已生成" : "暂无");
      case "VerificationAgent": {
        if (typeof metrics?.faithfulness_rate === "number") {
          const rate = Math.round(metrics.faithfulness_rate * 100);
          const unsupported = metrics?.unsupported_claim_count ?? 0;
          return `忠实率 ${rate}%｜未支撑 ${unsupported} 条`;
        }
        return outputSummary || "暂无";
      }
      case "RiskAgent":
        return typeof artifacts?.risk_count === "number"
          ? `${artifacts.risk_count} 条风险`
          : outputSummary || "暂无";
      case "QualityAgent": {
        const scoreText =
          typeof qualityScore === "number" ? `报告可信度 ${qualityScore}` : "尚未评分";
        const resultText =
          qualityApproved === true
            ? "审查通过"
            : isQualityRejected
              ? "已打回"
              : isHumanReviewRequired
                ? "待人工审核"
                : "待审查";
        return `${scoreText}｜${resultText}`;
      }
      case "StrategyAgent":
        return artifacts?.has_final_report ? "最终报告已生成" : outputSummary || "暂无";
      case humanReviewNode.name:
        return "等待人工复核";
      default:
        return outputSummary || "暂无";
    }
  }

  // 可视化列：Product 与 Business 并行展示为同一列的两行，其余各占一列；
  // 需要人工复核时在 Strategy 前插入人工复核列。
  const flowColumns: Array<{ key: string; nodes: AgentNode[] }> = [
    { key: "research", nodes: [agentNodes[0]] },
    { key: "evidence", nodes: [agentNodes[1]] },
    { key: "product-business", nodes: [agentNodes[2], agentNodes[3]] },
    { key: "verification", nodes: [agentNodes[4]] },
    { key: "risk", nodes: [agentNodes[5]] },
    { key: "quality", nodes: [agentNodes[6]] },
    ...(isHumanReviewRequired
      ? [{ key: "human", nodes: [humanReviewNode] }]
      : []),
    { key: "strategy", nodes: [agentNodes[7]] },
  ];
  const orderedNodeNames = flowColumns.flatMap((column) =>
    column.nodes.map((node) => node.name),
  );
  const stepIndexOf = (name: string) => orderedNodeNames.indexOf(name);
  const columnTone = (column: { nodes: AgentNode[] }) =>
    flowToneFromStatus(
      derivedStatuses[column.nodes[column.nodes.length - 1].name] ?? "pending",
    );

  if (!taskId) {
    return (
      <section className="mx-auto max-w-6xl">
        <EmptyState
          title="暂无任务"
          description="请先创建 gaming_mouse 分析任务，再查看 Agent 工作流。"
          action={
            <button
              className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              onClick={() => onNavigate("product-compare")}
              type="button"
            >
              产品对比
            </button>
          }
        />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-300">Agent 工作流</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            多 Agent 执行路径
          </h2>
          <p className="mt-3 max-w-3xl break-all text-sm leading-6 text-slate-400">
            <span title={`真实任务 ID：${taskId}`}>
              当前任务：{displayTaskId || taskId}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <StatusBadge label={status?.status ?? "加载中"} tone="info" />
          <StatusBadge
            label={`进度 ${status?.progress ?? 0}%`}
            tone={status?.progress === 100 ? "success" : "neutral"}
          />
          <StatusBadge label={qualityFlowLabel} tone={qualityFlowTone} />
          {isRefreshing ? <StatusBadge label="轮询中" tone="info" /> : null}
        </div>
      </div>

      {autoDemoActive ? (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-cyan-200/70 bg-cyan-50/80 px-4 py-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-500" />
          </span>
          <p className="text-sm font-medium text-cyan-800">
            当前正在展示：多 Agent 协作流程
          </p>
        </div>
      ) : null}

      {isInitialLoading ? (
        <LoadingState label="正在读取工作流状态、执行轨迹与质量结果..." />
      ) : null}

      {error ? (
        <div className="mb-5 rounded-md border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <div className="space-y-5">
        <section className="w-full max-w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70 p-5 shadow-[0_0_40px_rgba(15,23,42,0.45)]">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Agent 执行路径</h3>
              <p className="mt-1 text-sm text-slate-400">
                节点状态来自系统执行记录；每个 Agent 都会把基础硬件快评推进到最终购买建议。
              </p>
            </div>
            {lastUpdated ? (
              <p className="text-xs text-slate-500">
                更新于 {lastUpdated.toLocaleTimeString()}
              </p>
            ) : null}
          </div>

          <div className="-mx-1 w-full max-w-full overflow-x-auto overflow-y-hidden px-1 pb-2">
            <div className="flex min-w-max items-center gap-4">
              {flowColumns.map((column, columnIndex) => (
                <Fragment key={column.key}>
                  {column.nodes.length > 1 ? (
                    <div className="grid w-[230px] shrink-0 gap-3">
                      {column.nodes.map((node) => (
                        <AgentCard
                          agent={node}
                          badges={getNodeBadges(node.name)}
                          index={stepIndexOf(node.name)}
                          isSelected={selectedAgentName === node.name}
                          key={node.name}
                          onSelect={() => setSelectedAgentName(node.name)}
                          status={derivedStatuses[node.name] ?? "pending"}
                          produce={getAgentProduce(node.name)}
                          contribution={AGENT_SCORE_CONTRIBUTIONS[node.name] ?? "参与最终建议生成。"}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="w-[210px] shrink-0">
                      <AgentCard
                        agent={column.nodes[0]}
                        badges={
                          column.nodes[0].name === humanReviewNode.name
                            ? [{ label: "人工复核", tone: "warning" }]
                            : getNodeBadges(column.nodes[0].name)
                        }
                        index={stepIndexOf(column.nodes[0].name)}
                        isSelected={selectedAgentName === column.nodes[0].name}
                        onSelect={() => setSelectedAgentName(column.nodes[0].name)}
                        status={derivedStatuses[column.nodes[0].name] ?? "pending"}
                        produce={getAgentProduce(column.nodes[0].name)}
                        contribution={
                          AGENT_SCORE_CONTRIBUTIONS[column.nodes[0].name] ??
                          "参与最终建议生成。"
                        }
                      />
                    </div>
                  )}
                  {columnIndex < flowColumns.length - 1 ? (
                    <FlowConnector tone={columnTone(column)} />
                  ) : null}
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              当前 Agent
            </p>
            <p className="mt-2 break-words text-sm font-medium text-slate-100">
              {status?.current_agent || "等待中"}
            </p>
          </div>
          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              执行记录数
            </p>
            <p className="mt-2 text-sm font-medium text-slate-100">
              {traceLog.length} 条
            </p>
          </div>
          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              质量门控
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge label={qualityFlowLabel} tone={qualityFlowTone} />
              <span className="break-words text-sm font-medium text-slate-100">
                {qualityPayload?.quality_status || qualityResult?.status || "待处理"}
              </span>
            </div>
          </div>
          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              重试轮次
            </p>
            <p className="mt-2 text-sm font-medium text-slate-100">
              {typeof qualityPayload?.iteration_count === "number"
                ? `${qualityPayload.iteration_count} / 3`
                : "暂无"}
            </p>
          </div>
          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              打回状态
            </p>
            <p className="mt-2 text-sm font-medium text-slate-100">
              {rejectTo ? `已打回 ${rejectTo}` : "本次流程未触发打回"}
            </p>
          </div>
        </section>

        <section className="grid min-w-0 gap-4 xl:grid-cols-3">
          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">上下文管理</h3>
                <p className="mt-1 text-sm text-slate-400">
                  展示进入大模型 prompt 前的证据裁剪结果。
                </p>
              </div>
              <StatusBadge label={`${contextEntries.length} 个 Agent`} tone="info" />
            </div>
            <div className="mt-4 space-y-3">
              {contextEntries.length > 0 ? (
                contextEntries.map(([agentName, summary]) => (
                  <div
                    className="rounded-lg border border-slate-800 bg-slate-900/45 p-4"
                    key={agentName}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-100">
                        {agentName}
                      </span>
                      <StatusBadge
                        label={`裁剪 ${summary.trimmed_evidence_count ?? 0} 条`}
                        tone={(summary.trimmed_evidence_count ?? 0) > 0 ? "warning" : "success"}
                      />
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      原始 {summary.total_evidence_count ?? 0} 条，进入 prompt{" "}
                      {summary.selected_evidence_count ?? 0} 条
                    </p>
                    {summary.selected_evidence_ids?.length ? (
                      <p className="mt-2 break-words font-mono text-xs text-slate-500">
                        {summary.selected_evidence_ids.slice(0, 8).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-slate-800 bg-slate-900/45 px-4 py-3 text-sm text-slate-400">
                  暂无上下文摘要。
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">错误恢复</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Agent 异常会记录恢复动作，流程继续降级执行。
                </p>
              </div>
              <StatusBadge
                label={`${errorLog.length} 条`}
                tone={errorLog.length > 0 ? "warning" : "success"}
              />
            </div>
            <div className="mt-4 space-y-3">
              {errorLog.length > 0 ? (
                errorLog.slice(0, 4).map((item, index) => (
                  <div
                    className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4"
                    key={item.error_id ?? `${item.agent_name}-${index}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={item.agent_name ?? "UnknownAgent"} tone="warning" />
                      <span className="break-words text-sm text-amber-100">
                        {item.error_type ?? "error"}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-200">
                      {item.message || "无错误详情"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      恢复动作：{item.recover_action || "record_only"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  本次流程未出现需要降级恢复的错误。
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">人工审核单</h3>
                <p className="mt-1 text-sm text-slate-400">
                  三次自动修复仍失败时生成 ReviewTicket。
                </p>
              </div>
              <StatusBadge
                label={reviewTicket?.ticket_id ? "已生成" : "未触发"}
                tone={reviewTicket?.ticket_id ? "warning" : "neutral"}
              />
            </div>
            {reviewTicket?.ticket_id ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Ticket ID</dt>
                  <dd className="mt-1 break-words font-mono text-slate-100">
                    {reviewTicket.ticket_id}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">目标 Agent</dt>
                  <dd className="mt-1 text-slate-100">
                    {reviewTicket.target_agent || "未指定"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">失败检查项</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {(reviewTicket.failed_checks ?? []).length > 0 ? (
                      reviewTicket.failed_checks?.map((item) => (
                        <StatusBadge key={item} label={item} tone="warning" />
                      ))
                    ) : (
                      <span className="text-slate-400">无</span>
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 rounded-md border border-slate-800 bg-slate-900/45 px-4 py-3 text-sm text-slate-400">
                质量门控尚未触发人工审核。
              </p>
            )}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/80 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Agent 详情
                </p>
                <h3 className="mt-2 break-words text-xl font-semibold text-white">
                  {selectedAgent.name}
                </h3>
              </div>
              <StatusBadge
                label={statusLabel[selectedStatus]}
                tone={statusTone[selectedStatus]}
              />
            </div>

            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-slate-500">作用</dt>
                <dd className="mt-1 break-words text-slate-100">
                  {getAgentRole(selectedAgent.name)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">最新执行状态</dt>
                <dd className="mt-1 break-words text-slate-100">
                  {statusLabel[selectedStatus]}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">本次产出</dt>
                <dd className="mt-1 break-words text-slate-100">
                  {getAgentProduce(selectedAgent.name)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">对最终建议的贡献</dt>
                <dd className="mt-1 break-words leading-6 text-slate-100">
                  {AGENT_SCORE_CONTRIBUTIONS[selectedAgent.name] ?? "参与最终建议生成。"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">输出摘要</dt>
                <dd className="mt-1 break-words leading-6 text-slate-200">
                  {selectedTrace?.output_summary || "暂无输出摘要。"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">打回原因</dt>
                <dd className="mt-1 break-words leading-6 text-slate-200">
                  {selectedRejectReason || "无"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">修复建议</dt>
                <dd className="mt-2">
                  {selectedRequiredActions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedRequiredActions.map((action) => (
                        <StatusBadge key={action} label={action} tone="warning" />
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">无</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">打回目标</dt>
                <dd className="mt-1 break-words text-slate-100">
                  {selectedRejectTo || "无"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">执行耗时</dt>
                <dd className="mt-1 text-slate-100">
                  {typeof selectedTrace?.duration_ms === "number"
                    ? `${selectedTrace.duration_ms} ms`
                    : "未返回"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">错误信息</dt>
                <dd className="mt-1 break-words leading-6 text-slate-200">
                  {selectedTrace?.error || "无"}
                </dd>
              </div>
            </dl>

        </section>

        <section className="w-full max-w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">
                执行时间线
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                按时间展示系统返回的执行记录。
              </p>
            </div>
            <StatusBadge label={`${traceLog.length} 条记录`} tone="neutral" />
          </div>

          {traceLog.length === 0 ? (
            <p className="mt-4 rounded-md border border-slate-800 bg-slate-900/45 px-4 py-3 text-sm text-slate-400">
              暂无执行轨迹。
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {traceLog.map((trace, index) => {
                const traceRejectTo =
                  trace.reject_to ??
                  trace.target_agent ??
                  (trace.agent_name === "QualityAgent" ? rejectTo : null);
                const traceReason =
                  trace.reject_reason ??
                  trace.reason ??
                  (trace.agent_name === "QualityAgent" ? rejectReason : null);
                const traceTime = getTraceTime(trace);
                const isLatestTraceForAgent =
                  trace ===
                  traceHistoryByAgent[trace.agent_name]?.[
                    traceHistoryByAgent[trace.agent_name].length - 1
                  ];
                const isRerunSuccess =
                  normalizeStatus(trace.status) === "success" &&
                  (latestStatusIsSuccessAfterReject(
                    traceHistoryByAgent[trace.agent_name],
                  ) ||
                    uniqueRejectedAgents.includes(trace.agent_name));

                return (
                  <article
                    className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-4"
                    key={`${trace.agent_name}-${trace.step_id ?? index}`}
                  >
                    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">
                            {traceTime || `Step ${trace.step_id ?? index + 1}`}
                          </span>
                          <span className="break-words text-sm font-semibold text-white">
                            {trace.agent_name}
                          </span>
                          <StatusBadge
                            label={trace.status}
                            tone={traceTone(trace.status)}
                          />
                          {isLatestTraceForAgent && isRerunSuccess ? (
                            <StatusBadge label="已重跑" tone="warning" />
                          ) : null}
                        </div>
                        {trace.output_summary ? (
                          <p className="mt-3 break-words text-sm leading-6 text-slate-300">
                            {trace.output_summary}
                          </p>
                        ) : null}
                        {traceRejectTo || traceReason ? (
                          <p className="mt-2 break-words text-sm leading-6 text-amber-100">
                            {traceRejectTo ? `打回目标：${traceRejectTo}` : ""}
                            {traceRejectTo && traceReason ? " | " : ""}
                            {traceReason ? `原因：${traceReason}` : ""}
                          </p>
                        ) : null}
                      </div>
                      {typeof trace.duration_ms === "number" ? (
                        <span className="shrink-0 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                          {trace.duration_ms} ms
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
