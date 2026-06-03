import { useEffect, useMemo, useState } from "react";
import { analysisApi } from "../api/analysisApi";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { MetricCard } from "../components/common/MetricCard";
import { ScoreRing } from "../components/common/ScoreRing";
import { StatusBadge } from "../components/common/StatusBadge";
import { getCheckedItemLabel, getCoverageFieldLabel } from "../utils/labels";
import type {
  AgentTrace,
  FaithfulnessReport,
  MatrixIssue,
  QualityResult,
  ReviewTicket,
} from "../types/analysis";

type QualityPageProps = {
  taskId?: string;
  displayTaskId?: string;
  onNavigate: (key: string) => void;
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

type QualityTrace = AgentTrace & {
  reason?: string;
  reject_reason?: string;
};

type CheckStatus = "passed" | "failed" | "unknown";

type CheckEntry = {
  name: string;
  status: CheckStatus;
};

type CoverageItem = {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
};

const MAX_RETRY_COUNT = 3;

function normalizeTrace(traceLog: unknown): QualityTrace[] {
  if (!Array.isArray(traceLog)) {
    return [];
  }

  return traceLog
    .filter((item): item is Record<string, unknown> => {
      return Boolean(item) && typeof item === "object";
    })
    .map((item) => ({
      step_id: typeof item.step_id === "number" ? item.step_id : undefined,
      agent_name:
        typeof item.agent_name === "string" ? item.agent_name : "未知Agent",
      status: typeof item.status === "string" ? item.status : "pending",
      input_summary:
        typeof item.input_summary === "string" ? item.input_summary : undefined,
      output_summary:
        typeof item.output_summary === "string"
          ? item.output_summary
          : undefined,
      duration_ms:
        typeof item.duration_ms === "number" ? item.duration_ms : undefined,
      error:
        typeof item.error === "string" || item.error === null
          ? item.error
          : undefined,
      reason: typeof item.reason === "string" ? item.reason : undefined,
      reject_reason:
        typeof item.reject_reason === "string" ? item.reject_reason : undefined,
    }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function formatUnknownItem(item: unknown): string | null {
  if (typeof item === "string" && item.trim().length > 0) {
    return item;
  }

  if (typeof item === "number" || typeof item === "boolean") {
    return String(item);
  }

  const record = asRecord(item);
  if (Object.keys(record).length === 0) {
    return null;
  }

  const title =
    asOptionalString(record.name) ??
    asOptionalString(record.key) ??
    asOptionalString(record.risk_type) ??
    asOptionalString(record.dimension) ??
    asOptionalString(record.platform) ??
    asOptionalString(record.evidence_id);
  const severity = asOptionalString(record.severity);
  const description =
    asOptionalString(record.description) ??
    asOptionalString(record.reason) ??
    asOptionalString(record.summary);

  return [severity ? `[${severity}]` : null, title, description]
    .filter(Boolean)
    .join(" ");
}

function asList(value: unknown, fallback?: unknown): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = items
    .map(formatUnknownItem)
    .filter((item): item is string => Boolean(item));

  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackText = formatUnknownItem(fallback);
  return fallbackText ? [fallbackText] : [];
}

function normalizeStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getQualityScore(quality?: QualityResult): number | undefined {
  const score = quality?.score ?? quality?.quality_score;
  return typeof score === "number" ? score : undefined;
}

function getQualityApproved(payload: QualityPayload | null): boolean | undefined {
  if (typeof payload?.quality_result?.approved === "boolean") {
    return payload.quality_result.approved;
  }

  if (typeof payload?.is_approved === "boolean") {
    return payload.is_approved;
  }

  return undefined;
}

function formatValue(value?: number) {
  return typeof value === "number" ? value.toFixed(1) : "N/A";
}

function faithReasonLabel(reason?: string): string {
  if (!reason) {
    return "未支撑";
  }

  if (reason.startsWith("unsupported_numbers")) {
    const numbers = reason.split(":")[1] ?? "";
    return numbers ? `引用证据中不存在的数字：${numbers}` : "存在未被证据支撑的数字";
  }

  const map: Record<string, string> = {
    no_cited_evidence_text: "所引证据无可用文本",
    weak_lexical_grounding: "与证据词汇重合度低",
    grounded: "已被证据支撑",
  };
  return map[reason] ?? reason;
}

function matrixIssueLabel(issue: MatrixIssue): string {
  const matrixLabel =
    issue.matrix === "product_matrix"
      ? "产品矩阵"
      : issue.matrix === "business_matrix"
        ? "商业矩阵"
        : issue.matrix || "矩阵";
  const numbers = issue.missing_numbers?.length
    ? `未支撑数字：${issue.missing_numbers.join("、")}`
    : "存在未被证据支撑的内容";
  return `${matrixLabel} · ${issue.platform || "未知品牌"} · ${
    issue.dimension || "未知维度"
  }｜${numbers}`;
}

function normalizeCheckStatus(value: unknown): CheckStatus {
  if (typeof value === "boolean") {
    return value ? "passed" : "failed";
  }

  const record = asRecord(value);
  if (Object.keys(record).length > 0) {
    if ("passed" in record) {
      return normalizeCheckStatus(record.passed);
    }

    if ("status" in record) {
      return normalizeCheckStatus(record.status);
    }
  }

  const status = normalizeStatus(value);
  if (["true", "passed", "pass", "success", "approved"].includes(status)) {
    return "passed";
  }

  if (["false", "failed", "fail", "rejected", "not_approved"].includes(status)) {
    return "failed";
  }

  return "unknown";
}

function normalizeCheckedItems(value: unknown): CheckEntry[] {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (typeof item === "string") {
          return { name: item, status: "unknown" as const };
        }

        const record = asRecord(item);
        const name =
          asOptionalString(record.name) ??
          asOptionalString(record.key) ??
          asOptionalString(record.check) ??
          asOptionalString(record.id) ??
          asOptionalString(record.label) ??
          `检查项 ${index + 1}`;

        return {
          name,
          status: normalizeCheckStatus(
            "passed" in record ? record.passed : record.status,
          ),
        };
      })
      .filter((item) => item.name.trim().length > 0);
  }

  const record = asRecord(value);
  return Object.entries(record).map(([name, status]) => ({
    name,
    status: normalizeCheckStatus(status),
  }));
}

function mergeUnique(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

function StatusList({
  emptyLabel,
  items,
  tone = "neutral",
}: {
  emptyLabel: string;
  items: string[];
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  if (items.length === 0) {
    return <span className="text-sm text-slate-500">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <StatusBadge key={item} label={item} tone={tone} />
      ))}
    </div>
  );
}

function CheckList({
  emptyLabel,
  items,
  tone,
}: {
  emptyLabel: string;
  items: string[];
  tone: "success" | "warning" | "danger";
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          className={`rounded-md border px-3 py-2 text-sm ${
            tone === "success"
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
              : "border-rose-400/25 bg-rose-500/10 text-rose-100"
          }`}
          key={item}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function getCoverageItems(qualityRecord: Record<string, unknown>): CoverageItem[] {
  const missingDimensions = asList(qualityRecord.missing_dimensions).map((item) => ({
    label: `${getCoverageFieldLabel("missing_dimensions")}：${item}`,
    tone: "warning" as const,
  }));
  const missingPlatforms = asList(qualityRecord.missing_platforms).map((item) => ({
    label: `${getCoverageFieldLabel("missing_platforms")}：${item}`,
    tone: "warning" as const,
  }));
  const missingEvidence = asList(qualityRecord.missing_evidence).map((item) => ({
    label: `${getCoverageFieldLabel("missing_evidence")}：${item}`,
    tone: "warning" as const,
  }));
  const coverageGaps = asList(qualityRecord.coverage_gaps).map((item) => ({
    label: `${getCoverageFieldLabel("coverage_gaps")}：${item}`,
    tone: "warning" as const,
  }));
  const highRiskFlags = asList(qualityRecord.high_risk_flags).map((item) => ({
    label: `${getCoverageFieldLabel("high_risk_flags")}：${item}`,
    tone: "danger" as const,
  }));
  const riskFlags: CoverageItem[] = Array.isArray(qualityRecord.risk_flags)
    ? qualityRecord.risk_flags
        .map((risk): CoverageItem | null => {
          const record = asRecord(risk);
          const label = formatUnknownItem(risk);
          if (!label) {
            return null;
          }

          return {
            label: `${getCoverageFieldLabel("risk_flags")}：${label}`,
            tone:
              normalizeStatus(record.severity) === "high"
                ? ("danger" as const)
                : ("warning" as const),
          };
        })
        .filter((item): item is CoverageItem => item !== null)
    : asList(qualityRecord.risk_flags).map((item) => ({
        label: `${getCoverageFieldLabel("risk_flags")}：${item}`,
        tone: "warning" as const,
      }));

  return [
    ...missingDimensions,
    ...missingPlatforms,
    ...missingEvidence,
    ...coverageGaps,
    ...highRiskFlags,
    ...riskFlags,
  ];
}

function getQualityState({
  approved,
  inferredHumanReview,
  status,
}: {
  approved?: boolean;
  inferredHumanReview: boolean;
  status: string;
}) {
  if (inferredHumanReview || status.includes("human")) {
    return {
      label: "需要人工审核",
      tone: "warning" as const,
      description: "质量门控未能自动通过，需要人工复核。",
    };
  }

  if (
    approved === true ||
    ["approved", "pass", "passed", "success"].includes(status)
  ) {
    return {
      label: "质量审查通过",
      tone: "success" as const,
      description: "当前报告已通过自动质量门控。",
    };
  }

  if (
    approved === false ||
    status.includes("reject") ||
    status.includes("fail") ||
    status === "not_approved"
  ) {
    return {
      label: "质量审查未通过",
      tone: "danger" as const,
      description: "质量门控发现问题，需要打回修复或人工处理。",
    };
  }

  return {
    label: "质量审查待处理",
    tone: "neutral" as const,
    description: "等待 QualityAgent 返回质量审查结果。",
  };
}

export function QualityPage({
  taskId,
  displayTaskId,
  onNavigate,
}: QualityPageProps) {
  const [qualityPayload, setQualityPayload] = useState<QualityPayload | null>(
    null,
  );
  const [traceLog, setTraceLog] = useState<QualityTrace[]>([]);
  const [faithfulness, setFaithfulness] = useState<FaithfulnessReport | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setQualityPayload(null);
      setTraceLog([]);
      setFaithfulness(null);
      setError(null);
      return;
    }

    const activeTaskId = taskId;
    let cancelled = false;
    let timerId: number | undefined;
    let inFlight = false;

    // 任务可能还在运行，质检结果尚未生成。轮询刷新直到任务完成，避免停留在中间空态。
    async function refreshQuality() {
      if (inFlight) {
        return;
      }
      inFlight = true;

      const [statusResult, qualityResult, traceResult, faithfulnessResult] =
        await Promise.allSettled([
          analysisApi.getStatus(activeTaskId),
          analysisApi.getQuality(activeTaskId),
          analysisApi.getTrace(activeTaskId),
          analysisApi.getFaithfulness(activeTaskId),
        ]);

      if (cancelled) {
        inFlight = false;
        return;
      }

      if (qualityResult.status === "fulfilled") {
        setQualityPayload(qualityResult.value);
      }

      if (traceResult.status === "fulfilled") {
        setTraceLog(normalizeTrace(traceResult.value?.trace_log));
      }

      if (faithfulnessResult.status === "fulfilled") {
        setFaithfulness(faithfulnessResult.value?.faithfulness_report ?? null);
      }

      const failedEndpoints = [
        qualityResult.status === "rejected" ? "quality" : null,
        traceResult.status === "rejected" ? "trace" : null,
      ].filter((endpoint): endpoint is string => Boolean(endpoint));

      setError(
        failedEndpoints.length > 0
          ? `无法加载 ${failedEndpoints.join(", ")} 接口。`
          : null,
      );
      setIsLoading(false);
      inFlight = false;

      const taskStatus =
        statusResult.status === "fulfilled"
          ? normalizeStatus(statusResult.value?.status)
          : "";
      if ((taskStatus === "completed" || taskStatus === "failed") && timerId) {
        window.clearInterval(timerId);
        timerId = undefined;
      }
    }

    setIsLoading(true);
    setError(null);
    refreshQuality();
    timerId = window.setInterval(refreshQuality, 1800);

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, [taskId]);

  const quality = qualityPayload?.quality_result;
  const qualityRecord = asRecord(quality);
  const qualityScore = getQualityScore(quality);
  const approved = getQualityApproved(qualityPayload);
  const iterationCount =
    typeof qualityPayload?.iteration_count === "number"
      ? qualityPayload.iteration_count
      : undefined;
  const remainingRetryCount =
    typeof iterationCount === "number"
      ? Math.max(0, MAX_RETRY_COUNT - iterationCount)
      : undefined;
  const checkedItemEntries = normalizeCheckedItems(qualityRecord.checked_items);
  const explicitPassedChecks = asList(qualityRecord.passed_checks);
  const explicitFailedChecks = asList(qualityRecord.failed_checks);
  const inferredPassedChecks = checkedItemEntries
    .filter((item) => item.status === "passed")
    .map((item) => item.name);
  const inferredFailedChecks = checkedItemEntries
    .filter((item) => item.status === "failed")
    .map((item) => item.name);
  const passedChecks =
    explicitPassedChecks.length > 0 ? explicitPassedChecks : inferredPassedChecks;
  const failedChecks =
    explicitFailedChecks.length > 0 ? explicitFailedChecks : inferredFailedChecks;
  const displayCheckEntries =
    checkedItemEntries.length > 0
      ? checkedItemEntries
      : [
          ...passedChecks.map((name) => ({ name, status: "passed" as const })),
          ...failedChecks.map((name) => ({ name, status: "failed" as const })),
        ];
  const checkCount =
    checkedItemEntries.length > 0
      ? checkedItemEntries.length
      : mergeUnique(passedChecks, failedChecks).length;
  const requiredActions = asList(
    qualityRecord.required_actions,
    qualityRecord.required_fix,
  );
  const matrixIssues: MatrixIssue[] = Array.isArray(qualityRecord.matrix_issues)
    ? (qualityRecord.matrix_issues as MatrixIssue[])
    : faithfulness?.matrix_issues ?? [];
  const reviewTicket = qualityPayload?.review_ticket;
  const rejectedAgents = Array.isArray(qualityPayload?.rejected_agents)
    ? qualityPayload.rejected_agents
    : [];
  const rejectTo =
    asOptionalString(qualityRecord.reject_to) ??
    asOptionalString(qualityRecord.target_agent);
  const rejectReason =
    asOptionalString(qualityRecord.reject_reason) ??
    asOptionalString(qualityRecord.reason);
  const qualityStatus = normalizeStatus(
    qualityPayload?.quality_status ?? qualityRecord.status,
  );
  const needsHumanReviewFromRetry =
    qualityPayload?.needs_human_review === undefined &&
    typeof iterationCount === "number" &&
    iterationCount >= MAX_RETRY_COUNT;
  const needsHumanReview = Boolean(
    qualityPayload?.needs_human_review ||
      qualityStatus.includes("human") ||
      needsHumanReviewFromRetry,
  );
  const qualityState = getQualityState({
    approved,
    inferredHumanReview: needsHumanReview,
    status: qualityStatus,
  });
  const coverageItems = getCoverageItems(qualityRecord);
  const qualityTrace = useMemo(
    () =>
      traceLog
        .filter((trace) => trace.agent_name === "QualityAgent")
        .slice()
        .reverse()[0],
    [traceLog],
  );
  const hasQualityData = Boolean(
    qualityPayload &&
      (Object.keys(qualityRecord).length > 0 ||
        qualityPayload.quality_status ||
        typeof qualityPayload.iteration_count === "number" ||
        typeof qualityPayload.needs_human_review === "boolean" ||
        (qualityPayload.rejected_agents?.length ?? 0) > 0),
  );

  if (!taskId) {
    return (
      <section className="mx-auto max-w-6xl">
        <EmptyState
          title="暂无任务"
          description="请先启动 gaming_mouse 分析任务，再打开质量审查。"
          action={
            <button
              className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              onClick={() => onNavigate("new-analysis")}
              type="button"
            >
              新建分析
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
          <p className="text-sm font-medium text-cyan-300">质量审查</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            质量门控审查
          </h2>
          <p className="mt-3 max-w-3xl break-all text-sm leading-6 text-slate-400">
            <span title={`真实任务 ID：${taskId}`}>
              当前任务：{displayTaskId || taskId}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <StatusBadge label={qualityState.label} tone={qualityState.tone} />
          <StatusBadge
            label={qualityPayload?.quality_status || String(qualityRecord.status || "pending")}
            tone={needsHumanReview ? "warning" : "info"}
          />
        </div>
      </div>

      {isLoading ? <LoadingState label="正在加载质量门控结果..." /> : null}

      {error ? (
        <div className="mb-5 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        !hasQualityData ? (
          <EmptyState
            title="暂无质量结果"
            description="请等待 QualityAgent 执行完成后再查看。"
          />
        ) : (
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-cyan-300">当前质量状态</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {qualityState.label}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {qualityState.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <StatusBadge label={qualityState.label} tone={qualityState.tone} />
                  <StatusBadge
                    label={needsHumanReview ? "是否需要人工审核: 是" : "是否需要人工审核: 否"}
                    tone={needsHumanReview ? "warning" : "neutral"}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
              <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-center">
                <div className="flex justify-center">
                  <ScoreRing
                    value={typeof qualityScore === "number" ? qualityScore : 0}
                    label="质量得分"
                    decimals={1}
                    tone={
                      typeof qualityScore === "number" && qualityScore >= 80
                        ? "emerald"
                        : typeof qualityScore === "number" && qualityScore >= 60
                          ? "amber"
                          : "rose"
                    }
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-200">
                      自动重试进度
                    </p>
                    <span className="text-sm font-semibold text-slate-100">
                      {typeof iterationCount === "number"
                        ? `${iterationCount} / ${MAX_RETRY_COUNT}`
                        : `0 / ${MAX_RETRY_COUNT}`}
                    </span>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${
                        (iterationCount ?? 0) >= MAX_RETRY_COUNT
                          ? "bg-rose-400"
                          : "bg-cyan-400"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          ((iterationCount ?? 0) / MAX_RETRY_COUNT) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-3 text-sm text-slate-400">
                    {iterationCount === undefined || iterationCount === 0
                      ? "自动流程未触发重试。"
                      : iterationCount >= MAX_RETRY_COUNT
                        ? "已达到自动修复上限，需要人工审核。"
                        : `已自动修复 ${iterationCount} 轮，仍有 ${
                            MAX_RETRY_COUNT - iterationCount
                          } 次自动修复机会。`}
                  </p>
                </div>
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="质量得分"
                value={formatValue(qualityScore)}
                helper="质量得分"
              />
              <MetricCard
                label="重试轮次"
                value={
                  typeof iterationCount === "number"
                    ? `${iterationCount} / ${MAX_RETRY_COUNT}`
                    : "暂无"
                }
                helper="重试轮次"
              />
              <MetricCard
                label="检查项数量"
                value={checkCount}
                helper="检查项"
              />
              <MetricCard
                label="被打回 Agent"
                value={rejectedAgents.length}
                helper="打回记录"
              />
              <MetricCard
                label="是否需要人工审核"
                value={needsHumanReview ? "是" : "否"}
                helper="人工审核"
              />
            </div>

            <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    检查项展示
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    优先使用系统返回的通过/失败项；缺失时从检查项结果反推。
                  </p>
                </div>
                <StatusBadge
                  label={`${checkCount} 项检查`}
                  tone={failedChecks.length > 0 ? "warning" : "success"}
                />
              </div>

              {displayCheckEntries.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {displayCheckEntries.map((item, index) => {
                    const tone =
                      item.status === "passed"
                        ? "success"
                        : item.status === "failed"
                          ? "danger"
                          : "neutral";

                    return (
                      <div
                        className="checklist-item flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/45 px-4 py-3"
                        key={`${item.name}-${item.status}`}
                        style={{ animationDelay: `${index * 80}ms` }}
                      >
                        <span className="min-w-0 break-words text-sm text-slate-200">
                          {getCheckedItemLabel(item.name)}
                        </span>
                        <StatusBadge
                          label={
                            item.status === "passed"
                              ? "通过"
                              : item.status === "failed"
                                ? "失败"
                                : "未标记"
                          }
                          tone={tone}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="暂无检查项"
                  description="系统暂未返回可展示的质量检查项。"
                />
              )}

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <section className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-4">
                  <h4 className="text-sm font-semibold text-emerald-100">
                    通过检查项
                  </h4>
                  <div className="mt-3">
                    <CheckList
                      emptyLabel="暂无通过检查项"
                      items={passedChecks.map(getCheckedItemLabel)}
                      tone="success"
                    />
                  </div>
                </section>

                <section className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-4">
                  <h4 className="text-sm font-semibold text-rose-100">
                    失败检查项
                  </h4>
                  <div className="mt-3">
                    <CheckList
                      emptyLabel="暂无失败检查项"
                      items={failedChecks.map(getCheckedItemLabel)}
                      tone="danger"
                    />
                  </div>
                </section>
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    忠实性校验（防幻觉）
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    VerificationAgent 校验每条结论能否被其引用的证据支撑，未支撑结论会触发质量打回并从最终报告中剔除。
                  </p>
                </div>
                <StatusBadge
                  label={
                    typeof faithfulness?.faithfulness_rate === "number"
                      ? `忠实率 ${Math.round(faithfulness.faithfulness_rate * 100)}%`
                      : "暂无"
                  }
                  tone={
                    typeof faithfulness?.faithfulness_rate === "number"
                      ? faithfulness.faithfulness_rate >= 0.9
                        ? "success"
                        : faithfulness.faithfulness_rate >= 0.6
                          ? "warning"
                          : "danger"
                      : "neutral"
                  }
                />
              </div>

              {faithfulness ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                      label="校验结论数"
                      value={faithfulness.checked_claim_count ?? "N/A"}
                    />
                    <MetricCard
                      label="已支撑结论"
                      value={faithfulness.supported_claim_count ?? "N/A"}
                    />
                    <MetricCard
                      label="未支撑结论"
                      value={faithfulness.unsupported_claim_count ?? 0}
                    />
                    <MetricCard
                      label="弱支撑结论"
                      value={faithfulness.weak_claim_count ?? 0}
                    />
                  </div>

                  <div className="mt-5">
                    <h4 className="text-sm font-semibold text-rose-100">
                      未支撑结论（疑似幻觉）
                    </h4>
                    {faithfulness.claim_results &&
                    faithfulness.claim_results.some((item) => !item.supported) ? (
                      <ul className="mt-3 space-y-2">
                        {faithfulness.claim_results
                          .filter((item) => !item.supported)
                          .map((item) => (
                            <li
                              className="flex flex-col gap-1 rounded-md border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between"
                              key={item.claim_id}
                            >
                              <span className="font-mono text-xs text-rose-200">
                                {item.claim_id}
                              </span>
                              <span className="break-words">
                                {faithReasonLabel(item.reason)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="mt-3 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                        全部结论均能被其引用证据支撑，未发现疑似幻觉。
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  暂无忠实性校验结果，请等待 VerificationAgent 执行完成。
                </p>
              )}
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    矩阵防幻觉与人工审核单
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    矩阵分析中的数字也需要被引用证据支撑；三次自动修复失败后会生成 ReviewTicket。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    label={`矩阵问题 ${matrixIssues.length} 条`}
                    tone={matrixIssues.length > 0 ? "warning" : "success"}
                  />
                  <StatusBadge
                    label={reviewTicket?.ticket_id ? "审核单已生成" : "审核单未触发"}
                    tone={reviewTicket?.ticket_id ? "warning" : "neutral"}
                  />
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">
                    矩阵问题
                  </h4>
                  {matrixIssues.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {matrixIssues.slice(0, 8).map((issue, index) => (
                        <li
                          className="rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm leading-6 text-amber-100"
                          key={`${issue.matrix}-${issue.platform}-${issue.dimension}-${index}`}
                        >
                          {matrixIssueLabel(issue)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                      矩阵分析未发现未支撑数字。
                    </p>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-200">
                    ReviewTicket
                  </h4>
                  {reviewTicket?.ticket_id ? (
                    <dl className="mt-3 space-y-3 rounded-md border border-amber-400/25 bg-amber-400/10 p-4 text-sm">
                      <div>
                        <dt className="text-slate-500">Ticket ID</dt>
                        <dd className="mt-1 break-words font-mono text-amber-100">
                          {reviewTicket.ticket_id}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">目标 Agent</dt>
                        <dd className="mt-1 text-amber-100">
                          {reviewTicket.target_agent || "未指定"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">下一步</dt>
                        <dd className="mt-2 space-y-2">
                          {(reviewTicket.suggested_next_steps ?? []).length > 0 ? (
                            reviewTicket.suggested_next_steps?.map((step) => (
                              <p className="break-words text-amber-100" key={step}>
                                {step}
                              </p>
                            ))
                          ) : (
                            <span className="text-slate-400">暂无</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-3 rounded-md border border-slate-800 bg-slate-900/45 px-3 py-2 text-sm text-slate-400">
                      当前流程尚未进入人工审核。
                    </p>
                  )}
                </div>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
                <h3 className="text-lg font-semibold text-white">打回路径</h3>
                <dl className="mt-4 space-y-4 text-sm">
                  <div>
                    <dt className="text-slate-500">打回目标</dt>
                    <dd className="mt-1 break-words text-slate-100">
                      {rejectTo || "无"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">打回原因</dt>
                    <dd className="mt-1 break-words leading-6 text-slate-200">
                      {rejectReason || "无"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">被打回 Agent</dt>
                    <dd className="mt-2">
                      <StatusList
                        emptyLabel="无"
                        items={rejectedAgents}
                        tone="warning"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">修复建议</dt>
                    <dd className="mt-2">
                      <StatusList
                        emptyLabel="无"
                        items={requiredActions}
                        tone="warning"
                      />
                    </dd>
                  </div>
                </dl>
              </section>

              <section
                className={`rounded-lg border p-5 ${
                  needsHumanReview
                    ? "border-amber-400/35 bg-amber-400/10"
                    : "border-slate-800 bg-slate-950/80"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold text-white">
                    重试与人工审核
                  </h3>
                  <StatusBadge
                    label={needsHumanReview ? "需要人工审核" : "自动流程"}
                    tone={needsHumanReview ? "warning" : "neutral"}
                  />
                </div>
                <dl className="mt-4 space-y-4 text-sm">
                  <div>
                    <dt className="text-slate-500">当前重试轮次</dt>
                    <dd className="mt-1 text-slate-100">
                      {typeof iterationCount === "number"
                        ? `${iterationCount} / ${MAX_RETRY_COUNT}`
                        : "暂无"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">剩余自动修复次数</dt>
                    <dd className="mt-1 text-slate-100">
                      {typeof remainingRetryCount === "number"
                        ? remainingRetryCount
                        : "暂无"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">是否需要人工审核</dt>
                    <dd className="mt-1 text-slate-100">
                      {needsHumanReview ? "是" : "否"}
                    </dd>
                  </div>
                </dl>
                {needsHumanReview ? (
                  <p className="mt-5 rounded-md border border-amber-300/30 bg-slate-950/40 px-4 py-3 text-sm leading-6 text-amber-100">
                    {needsHumanReviewFromRetry
                      ? "根据重试轮次推断：自动修复已达到上限，请进入人工审核。"
                      : "自动修复已达到上限，请进入人工审核。"}
                  </p>
                ) : null}
              </section>
            </div>

            <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">覆盖缺口</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    展示缺失维度、缺失品牌、缺失证据、覆盖缺口与风险标记。
                  </p>
                </div>
                <StatusBadge
                  label={coverageItems.length > 0 ? "存在缺口" : "覆盖完整"}
                  tone={coverageItems.length > 0 ? "warning" : "success"}
                />
              </div>
              {coverageItems.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {coverageItems.map((item) => (
                    <StatusBadge
                      key={`${item.label}-${item.tone}`}
                      label={item.label}
                      tone={item.tone}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">暂无覆盖缺口</p>
              )}
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
              <h3 className="text-lg font-semibold text-white">
                最近一次质量审查记录
              </h3>
              <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-slate-500">最新执行状态</dt>
                  <dd className="mt-1 text-slate-100">
                    {qualityTrace?.status || "未返回"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">执行耗时</dt>
                  <dd className="mt-1 text-slate-100">
                    {typeof qualityTrace?.duration_ms === "number"
                      ? `${qualityTrace.duration_ms} ms`
                      : "未返回"}
                  </dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-slate-500">输出摘要</dt>
                  <dd className="mt-1 break-words leading-6 text-slate-200">
                    {qualityTrace?.output_summary ||
                      "暂无 QualityAgent 执行摘要。"}
                  </dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-slate-500">原因</dt>
                  <dd className="mt-1 break-words leading-6 text-slate-200">
                    {qualityTrace?.reject_reason ?? qualityTrace?.reason ?? "无"}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        )
      ) : null}
    </section>
  );
}
