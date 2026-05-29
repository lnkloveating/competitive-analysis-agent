import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { StatusBadge } from "../components/common/StatusBadge";
import { analysisApi } from "../api/analysisApi";
import type { AgentTrace, AnalysisStatus, QualityResult } from "../types/analysis";

type WorkflowPageProps = {
  taskId?: string;
  onNavigate: (key: string) => void;
};

type AgentStatus = "pending" | "running" | "success" | "rejected" | "failed";

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
};

const agentNodes: AgentNode[] = [
  {
    name: "ResearchAgent",
    label: "Research",
    subtitle: "Public research",
  },
  {
    name: "EvidenceAgent",
    label: "Evidence",
    subtitle: "Evidence extraction",
  },
  {
    name: "ProductAgent",
    label: "Product",
    subtitle: "Product matrix",
  },
  {
    name: "BusinessAgent",
    label: "Business",
    subtitle: "Business matrix",
  },
  {
    name: "RiskAgent",
    label: "Risk",
    subtitle: "Risk flags",
  },
  {
    name: "QualityAgent",
    label: "Quality",
    subtitle: "Quality gate",
  },
  {
    name: "StrategyAgent",
    label: "Strategy",
    subtitle: "Final report",
  },
];

const statusTone: Record<AgentStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  pending: "neutral",
  running: "info",
  success: "success",
  rejected: "warning",
  failed: "danger",
};

const nodeClasses: Record<AgentStatus, string> = {
  pending: "border-slate-700 bg-slate-900/55 text-slate-300",
  running:
    "border-cyan-300/70 bg-cyan-300/10 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.22)]",
  success:
    "border-emerald-400/60 bg-emerald-400/10 text-emerald-100 shadow-[0_0_24px_rgba(52,211,153,0.16)]",
  rejected:
    "border-amber-400/65 bg-amber-400/10 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.14)]",
  failed:
    "border-rose-400/70 bg-rose-500/10 text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.18)]",
};

function normalizeTrace(traceLog: unknown): AgentTrace[] {
  if (!Array.isArray(traceLog)) {
    return [];
  }

  return traceLog
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      step_id: typeof item.step_id === "number" ? item.step_id : undefined,
      agent_name: typeof item.agent_name === "string" ? item.agent_name : "UnknownAgent",
      status: typeof item.status === "string" ? item.status : "pending",
      input_summary: typeof item.input_summary === "string" ? item.input_summary : undefined,
      output_summary: typeof item.output_summary === "string" ? item.output_summary : undefined,
      duration_ms: typeof item.duration_ms === "number" ? item.duration_ms : undefined,
      error:
        typeof item.error === "string" || item.error === null
          ? item.error
          : undefined,
    }));
}

function normalizeStatus(value?: string): string {
  return (value || "").toLowerCase();
}

function buildLatestTraceMap(traceLog: AgentTrace[]) {
  return traceLog.reduce<Record<string, AgentTrace>>((acc, trace) => {
    if (trace.agent_name) {
      acc[trace.agent_name] = trace;
    }
    return acc;
  }, {});
}

function deriveAgentStatus(
  agentName: string,
  latestTrace: AgentTrace | undefined,
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

function getQualityScore(quality?: QualityResult): number | undefined {
  const score = quality?.score ?? quality?.quality_score;
  return typeof score === "number" ? score : undefined;
}

function getQualityApproved(qualityPayload: QualityPayload | null): boolean | undefined {
  if (typeof qualityPayload?.quality_result?.approved === "boolean") {
    return qualityPayload.quality_result.approved;
  }

  if (typeof qualityPayload?.is_approved === "boolean") {
    return qualityPayload.is_approved;
  }

  return undefined;
}

function statusIcon(status: AgentStatus) {
  if (status === "success") {
    return "✓";
  }

  if (status === "rejected") {
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
  agent,
  index,
  isSelected,
  onSelect,
  status,
}: {
  agent: AgentNode;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  status: AgentStatus;
}) {
  return (
    <button
      className={`workflow-node-enter min-h-32 rounded-lg border p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/70 ${nodeClasses[status]} ${
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
        <StatusBadge label={status} tone={statusTone[status]} />
      </div>
    </button>
  );
}

function FlowConnector() {
  return (
    <div className="hidden items-center justify-center xl:flex">
      <span className="workflow-flow-line h-px w-full min-w-10" />
    </div>
  );
}

export function WorkflowPage({ taskId, onNavigate }: WorkflowPageProps) {
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [traceLog, setTraceLog] = useState<AgentTrace[]>([]);
  const [qualityPayload, setQualityPayload] = useState<QualityPayload | null>(null);
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
      setError(null);
      setLastUpdated(null);
      return;
    }

    let cancelled = false;
    let timerId: number | undefined;
    let inFlight = false;

    async function refreshWorkflow() {
      if (inFlight) {
        return;
      }

      inFlight = true;
      setIsRefreshing(true);

      const [statusResult, traceResult, qualityResult] = await Promise.allSettled([
        analysisApi.getStatus(taskId),
        analysisApi.getTrace(taskId),
        analysisApi.getQuality(taskId),
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
      } else {
        failedEndpoints.push("trace");
      }

      if (qualityResult.status === "fulfilled") {
        setQualityPayload(qualityResult.value);
      } else {
        failedEndpoints.push("quality");
      }

      setError(
        failedEndpoints.length > 0
          ? `Unable to refresh ${failedEndpoints.join(", ")} endpoint.`
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

  const latestTraceByAgent = useMemo(() => buildLatestTraceMap(traceLog), [traceLog]);

  const derivedStatuses = useMemo(
    () =>
      agentNodes.reduce<Record<string, AgentStatus>>((acc, agent) => {
        acc[agent.name] = deriveAgentStatus(
          agent.name,
          latestTraceByAgent[agent.name],
          status,
        );
        return acc;
      }, {}),
    [latestTraceByAgent, status],
  );

  const selectedAgent =
    agentNodes.find((agent) => agent.name === selectedAgentName) ?? agentNodes[0];
  const selectedTrace = latestTraceByAgent[selectedAgent.name];
  const selectedStatus = derivedStatuses[selectedAgent.name] ?? "pending";
  const qualityResult = qualityPayload?.quality_result;
  const qualityScore = getQualityScore(qualityResult);
  const qualityApproved = getQualityApproved(qualityPayload);
  const checkedItems = qualityResult?.checked_items ?? {};
  const requiredActions = asList(
    qualityResult?.required_actions,
    qualityResult?.required_fix,
  );
  const rejectTo = qualityResult?.reject_to ?? qualityResult?.target_agent ?? null;
  const rejectReason =
    qualityResult?.reject_reason ?? qualityResult?.reason ?? qualityResult?.status ?? null;

  if (!taskId) {
    return (
      <section className="mx-auto max-w-6xl">
        <EmptyState
          title="No active task"
          description="Create a gaming_mouse analysis task before viewing the agent workflow."
          action={
            <button
              className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              onClick={() => onNavigate("new-analysis")}
              type="button"
            >
              New Analysis
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
          <p className="text-sm font-medium text-cyan-300">Agent Workflow</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            Live Multi-Agent DAG
          </h2>
          <p className="mt-3 max-w-3xl break-all text-sm leading-6 text-slate-400">
            Task ID: {taskId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <StatusBadge label={status?.status ?? "loading"} tone="info" />
          <StatusBadge
            label={`progress ${status?.progress ?? 0}%`}
            tone={status?.progress === 100 ? "success" : "neutral"}
          />
          {isRefreshing ? <StatusBadge label="polling" tone="info" /> : null}
        </div>
      </div>

      {isInitialLoading ? (
        <LoadingState label="Reading workflow status, trace and quality..." />
      ) : null}

      {error ? (
        <div className="mb-5 rounded-md border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-5 shadow-[0_0_40px_rgba(15,23,42,0.45)]">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Agent Execution Path</h3>
              <p className="mt-1 text-sm text-slate-400">
                Node state is derived from backend trace_log and current_agent.
              </p>
            </div>
            {lastUpdated ? (
              <p className="text-xs text-slate-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_48px_1fr_48px_1.2fr_48px_1fr_48px_1fr_48px_1fr] xl:items-center">
            <AgentCard
              agent={agentNodes[0]}
              index={0}
              isSelected={selectedAgentName === agentNodes[0].name}
              onSelect={() => setSelectedAgentName(agentNodes[0].name)}
              status={derivedStatuses[agentNodes[0].name] ?? "pending"}
            />
            <FlowConnector />
            <AgentCard
              agent={agentNodes[1]}
              index={1}
              isSelected={selectedAgentName === agentNodes[1].name}
              onSelect={() => setSelectedAgentName(agentNodes[1].name)}
              status={derivedStatuses[agentNodes[1].name] ?? "pending"}
            />
            <FlowConnector />
            <div className="grid gap-3">
              <AgentCard
                agent={agentNodes[2]}
                index={2}
                isSelected={selectedAgentName === agentNodes[2].name}
                onSelect={() => setSelectedAgentName(agentNodes[2].name)}
                status={derivedStatuses[agentNodes[2].name] ?? "pending"}
              />
              <AgentCard
                agent={agentNodes[3]}
                index={3}
                isSelected={selectedAgentName === agentNodes[3].name}
                onSelect={() => setSelectedAgentName(agentNodes[3].name)}
                status={derivedStatuses[agentNodes[3].name] ?? "pending"}
              />
            </div>
            <FlowConnector />
            <AgentCard
              agent={agentNodes[4]}
              index={4}
              isSelected={selectedAgentName === agentNodes[4].name}
              onSelect={() => setSelectedAgentName(agentNodes[4].name)}
              status={derivedStatuses[agentNodes[4].name] ?? "pending"}
            />
            <FlowConnector />
            <AgentCard
              agent={agentNodes[5]}
              index={5}
              isSelected={selectedAgentName === agentNodes[5].name}
              onSelect={() => setSelectedAgentName(agentNodes[5].name)}
              status={derivedStatuses[agentNodes[5].name] ?? "pending"}
            />
            <FlowConnector />
            <AgentCard
              agent={agentNodes[6]}
              index={6}
              isSelected={selectedAgentName === agentNodes[6].name}
              onSelect={() => setSelectedAgentName(agentNodes[6].name)}
              status={derivedStatuses[agentNodes[6].name] ?? "pending"}
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Current Agent
              </p>
              <p className="mt-2 text-sm font-medium text-slate-100">
                {status?.current_agent || "Waiting"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Trace Entries
              </p>
              <p className="mt-2 text-sm font-medium text-slate-100">
                {traceLog.length}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Quality Status
              </p>
              <p className="mt-2 text-sm font-medium text-slate-100">
                {qualityPayload?.quality_status || qualityResult?.status || "Pending"}
              </p>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Agent Detail
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                {selectedAgent.name}
              </h3>
            </div>
            <StatusBadge label={selectedStatus} tone={statusTone[selectedStatus]} />
          </div>

          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">status</dt>
              <dd className="mt-1 text-slate-100">
                {selectedTrace?.status ?? selectedStatus}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">output_summary</dt>
              <dd className="mt-1 leading-6 text-slate-200">
                {selectedTrace?.output_summary || "No output summary from trace yet."}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">duration_ms</dt>
              <dd className="mt-1 text-slate-100">
                {typeof selectedTrace?.duration_ms === "number"
                  ? selectedTrace.duration_ms
                  : "Not reported"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">error</dt>
              <dd className="mt-1 leading-6 text-slate-200">
                {selectedTrace?.error || "None"}
              </dd>
            </div>
          </dl>

          {selectedAgent.name === "QualityAgent" ? (
            <div className="mt-6 border-t border-slate-800 pt-5">
              <h4 className="text-sm font-semibold text-white">Quality Gate</h4>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-slate-500">approved</dt>
                  <dd className="mt-1 text-slate-100">
                    {typeof qualityApproved === "boolean"
                      ? String(qualityApproved)
                      : "Not reported"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">score</dt>
                  <dd className="mt-1 text-slate-100">
                    {typeof qualityScore === "number" ? qualityScore : "Not reported"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">reject_to</dt>
                  <dd className="mt-1 text-slate-100">{rejectTo || "None"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">reject_reason</dt>
                  <dd className="mt-1 leading-6 text-slate-200">
                    {rejectReason || "None"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  required_actions
                </p>
                {requiredActions.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {requiredActions.map((action) => (
                      <li
                        className="rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
                        key={action}
                      >
                        {action}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">No required actions.</p>
                )}
              </div>

              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  checked_items
                </p>
                {Object.keys(checkedItems).length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {Object.entries(checkedItems).map(([name, passed]) => (
                      <div
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/55 px-3 py-2 text-sm"
                        key={name}
                      >
                        <span className="text-slate-200">{name}</span>
                        <StatusBadge
                          label={passed ? "passed" : "failed"}
                          tone={passed ? "success" : "danger"}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">
                    No checked_items returned yet.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
