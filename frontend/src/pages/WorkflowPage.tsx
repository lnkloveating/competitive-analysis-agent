import { useEffect, useMemo, useState } from "react";
import { analysisApi } from "../api/analysisApi";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { StatusBadge } from "../components/common/StatusBadge";
import type { AgentSidebarItem } from "../components/layout/Sidebar";
import type {
  AgentTrace,
  AnalysisStatus,
  ArtifactsSummary,
  ErrorLogItem,
  FinalReport,
  QualityResult,
  ReviewTicket,
} from "../types/analysis";

type WorkflowPageProps = {
  taskId?: string;
  displayTaskId?: string;
  agentDetailName?: string | null;
  onAgentOpen: (agentName: string) => void;
  onAgentDetailClose: () => void;
  selectedAgent: string;
  onSelectedAgentChange: (agentName: string) => void;
  onSidebarAgentsChange?: (agents: AgentSidebarItem[]) => void;
  onNavigate: (key: string) => void;
};

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
type AgentStatus = AgentSidebarItem["status"];

type AgentDefinition = {
  name: string;
  role: string;
  summary: string;
  detail: string;
  input: string;
  output: string;
};

type ReportResponse = {
  final_report?: FinalReport;
  quality_result?: QualityResult;
  quality_status?: string;
  degraded_report?: boolean;
  needs_human_review?: boolean;
  review_ticket?: ReviewTicket;
};

const AGENTS: AgentDefinition[] = [
  {
    name: "ResearchAgent",
    role: "调研规划员",
    summary: "规划本次分析需要哪些数据",
    detail: "把用户输入拆成数据需求：本地硬件事实、官网规格、用户评价、博主测评、实时价格、驱动生态。",
    input: "产品 A / 产品 B + 分析场景",
    output: "data_requirements / pending_data",
  },
  {
    name: "CollectorAgent",
    role: "采集与实体识别员",
    summary: "识别产品，并调度本地库与 MCP 工具层",
    detail: "完成别名命中、实体消歧、变体识别、本地 JSON 读取；后续会并行调用官网、评价、价格、搜索 MCP。",
    input: "用户输入 + 本地事实库 + MCP Tool Layer",
    output: "resolved_products / product_facts / pending external data",
  },
  {
    name: "EvidenceAgent",
    role: "证据结构化员",
    summary: "把采集结果变成可追溯 evidence",
    detail: "统一 evidence_id、source_type、credibility、source_url，让后续 claim 必须绑定证据。",
    input: "raw_research / local facts / pending records",
    output: "evidence_list / evidence_status",
  },
  {
    name: "AnalysisAgent",
    role: "分析师",
    summary: "只分析有证据支撑的事实差异",
    detail: "当前主要分析硬件事实；没有真实评价/测评证据时，不输出握法、手型、适合游戏等主观结论。",
    input: "evidence_list + product facts",
    output: "hardware_analysis / claims / risks",
  },
  {
    name: "VerificationAgent",
    role: "事实校验员",
    summary: "检查结论是否被 evidence 支撑",
    detail: "检查 claim.evidence_ids 是否有效，数字和矩阵结论是否能被引用证据支撑，拦截幻觉结论。",
    input: "claims / evidence_list / matrices",
    output: "faithfulness_report / unsupported_claim_ids",
  },
  {
    name: "QualityAgent",
    role: "质量门控员",
    summary: "决定通过、打回或有限报告",
    detail: "可以打回 Research、Collector、Evidence、Analysis；多次自动修复仍不足时生成 partial_report。",
    input: "faithfulness / risks / pending data / coverage",
    output: "quality_result / reject_to / approved_with_limitations",
  },
  {
    name: "ReportAgent",
    role: "报告撰写员",
    summary: "生成最终报告",
    detail: "只整合前面 Agent 的结构化结果，输出最终建议、风险披露、pending 数据说明和证据引用。",
    input: "verified claims + quality result",
    output: "final_report / used_claim_ids / used_evidence_ids",
  },
];

const MCP_TOOLS = [
  { name: "本地 JSON 事实库", status: "active", detail: "当前已启用，提供稳定硬件参数和型号别名。" },
  { name: "官网规格 MCP", status: "pending", detail: "后续并行采集官方规格、固件更新、驱动资料。" },
  { name: "评价/测评 MCP", status: "pending", detail: "后续并行采集用户反馈、博主测评和体验口碑。" },
  { name: "实时价格 MCP", status: "pending", detail: "后续并行采集价格、折扣和地区可买性。" },
  { name: "搜索 MCP", status: "pending", detail: "后续处理未知简称、变体和新品识别。" },
];

const QUALITY_TARGETS = [
  { name: "ResearchAgent", reason: "数据需求不完整" },
  { name: "CollectorAgent", reason: "缺少竞品或来源" },
  { name: "EvidenceAgent", reason: "证据结构不合格" },
  { name: "AnalysisAgent", reason: "结论没有证据支撑" },
];

const RESEARCH_REQUIREMENTS = [
  {
    name: "硬件数据",
    status: "complete",
    owner: "本地 JSON / OfficialSpec MCP",
    fields: ["重量", "尺寸", "传感器", "DPI", "回报率", "连接方式", "点击系统", "软件"],
    summary: "如果本地 JSON 命中两款产品，则直接展示硬件事实；否则标记为 pending，等待官网 MCP 补齐。",
  },
  {
    name: "用户评价与电商评论",
    status: "pending",
    owner: "ReviewIntel MCP",
    fields: ["手感", "品控", "售后", "长期使用问题", "适合人群"],
    summary: "当前不输出体验结论，等待真实评论采集和 LLM 汇总。",
  },
  {
    name: "博主测评与体验口碑",
    status: "pending",
    owner: "ReviewIntel MCP",
    fields: ["握法", "游戏类型", "对比观点", "延迟/续航体验"],
    summary: "后续采集 Bilibili / YouTube / 专业测评站摘要。",
  },
  {
    name: "实时价格与可买性",
    status: "pending",
    owner: "Price MCP",
    fields: ["当前价格", "折扣", "区域库存", "历史低价"],
    summary: "价格不再写死，后续由实时 MCP 补齐。",
  },
  {
    name: "驱动生态与软件体验",
    status: "partial",
    owner: "CollectorAgent / ReviewIntel MCP",
    fields: ["驱动名称", "板载内存", "宏/配置", "稳定性反馈"],
    summary: "本地只保留软件事实，驱动稳定性等待用户评价验证。",
  },
];

const SOURCE_PRIORITIES = [
  {
    level: "P0",
    name: "品牌官网 / 官方规格",
    credibility: "最高",
    usage: "硬件参数、固件、驱动、官方型号命名",
  },
  {
    level: "P1",
    name: "专业测评站 / 实测数据",
    credibility: "高",
    usage: "传感器表现、延迟、重量校验、续航实测",
  },
  {
    level: "P2",
    name: "博主测评 / 长视频体验",
    credibility: "中",
    usage: "手感、握法、游戏场景、对比体验",
  },
  {
    level: "P3",
    name: "电商评论 / 社区口碑",
    credibility: "需交叉验证",
    usage: "品控、售后、长期可靠性、驱动问题",
  },
];

const RESEARCH_HANDOFFS = [
  {
    agent: "CollectorAgent",
    task: "根据数据需求调度本地 JSON 与后续 MCP 工具，完成产品识别和数据采集。",
  },
  {
    agent: "EvidenceAgent",
    task: "把采集结果统一转换成 evidence，并标注来源、可信度和 pending 状态。",
  },
  {
    agent: "AnalysisAgent",
    task: "只分析 evidence 支撑的硬件事实差异，外部体验数据缺失时不编结论。",
  },
  {
    agent: "QualityAgent",
    task: "检查结论是否有证据、pending 是否披露，并据此降低报告可信度。",
  },
];

const STATUS_LABEL: Record<AgentStatus, string> = {
  waiting: "等待",
  running: "运行中",
  done: "完成",
  limited: "有限通过",
  partial: "有限报告",
  failed: "失败",
};

const STATUS_TONE: Record<AgentStatus, Tone> = {
  waiting: "neutral",
  running: "info",
  done: "success",
  limited: "warning",
  partial: "warning",
  failed: "danger",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalize(value: unknown): string {
  return asString(value).toLowerCase();
}

function extractReport(response: ReportResponse | FinalReport | null): Record<string, unknown> {
  if (!response) return {};
  const record = asRecord(response);
  return asRecord(record.final_report ?? response);
}

function traceMap(traceLog: AgentTrace[]) {
  return traceLog.reduce<Record<string, AgentTrace>>((acc, trace) => {
    acc[trace.agent_name] = trace;
    return acc;
  }, {});
}

function qualityStatusText(
  status: AnalysisStatus | null,
  quality: QualityResult | undefined,
  reportResponse: ReportResponse | FinalReport | null,
  report: Record<string, unknown>,
) {
  const responseRecord = asRecord(reportResponse);
  return (
    asString(quality?.status) ||
    asString(responseRecord.quality_status) ||
    asString(report.quality_status) ||
    asString(status?.quality_status) ||
    "pending"
  );
}

function isFinalDone(status: AnalysisStatus | null) {
  return normalize(status?.status) === "completed" || normalize(status?.status) === "failed";
}

function deriveStatus(
  agent: AgentDefinition,
  trace: AgentTrace | undefined,
  status: AnalysisStatus | null,
  qualityStatus: string,
  hasReport: boolean,
): AgentStatus {
  if (status?.current_agent === agent.name && !isFinalDone(status)) return "running";
  const traceStatus = normalize(trace?.status);
  if (traceStatus === "failed" || traceStatus === "schema_failed") return "failed";
  if (agent.name === "QualityAgent") {
    const quality = normalize(qualityStatus);
    if (quality === "partial_report") return "partial";
    if (quality === "approved_with_limitations") return "limited";
    if (quality === "approved") return "done";
  }
  if (agent.name === "ReportAgent" && hasReport) return "done";
  if (trace) return "done";
  return "waiting";
}

function qualityTone(qualityStatus: string): Tone {
  const value = normalize(qualityStatus);
  if (value === "approved") return "success";
  if (value === "approved_with_limitations" || value === "partial_report") return "warning";
  if (value.includes("reject") || value === "failed") return "danger";
  return "neutral";
}

function currentIndex(currentAgent: string) {
  const index = AGENTS.findIndex((agent) => agent.name === currentAgent);
  return index >= 0 ? index : -1;
}

function tooltipClass(extra = "") {
  return `pointer-events-none absolute z-40 hidden w-72 rounded-lg border border-cyan-300/25 bg-slate-950/95 p-3 text-left text-xs leading-5 text-slate-300 shadow-[0_20px_60px_rgba(2,6,23,0.65)] group-hover:block ${extra}`;
}

function FlowStyles() {
  return (
    <style>
      {`
        @keyframes dag-flow {
          0% { transform: translateX(0); opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateX(34px); opacity: 0; }
        }
        @keyframes dag-drop {
          0% { transform: translateY(0); opacity: .2; }
          40% { opacity: 1; }
          100% { transform: translateY(24px); opacity: .2; }
        }
        @keyframes agent-card-pulse {
          0%, 100% { box-shadow: 0 0 0 rgba(34, 211, 238, 0); }
          50% { box-shadow: 0 0 28px rgba(34, 211, 238, 0.18); }
        }
      `}
    </style>
  );
}

function FlowArrow({ active, label }: { active: boolean; label?: string }) {
  return (
    <div className="relative flex h-full min-w-7 items-center">
      <div className={`h-px w-full ${active ? "bg-cyan-300/70" : "bg-slate-700"}`} />
      {active ? (
        <span
          className="absolute left-0 h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.9)]"
          style={{ animation: "dag-flow 1.6s linear infinite" }}
        />
      ) : null}
      {label ? (
        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-slate-500">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function AgentNode({
  agent,
  status,
  isCurrent,
  isSelected,
  onSelect,
}: {
  agent: AgentDefinition;
  status: AgentStatus;
  isCurrent: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const activeClass = isCurrent
    ? "border-cyan-300 bg-cyan-400/15 shadow-[0_0_28px_rgba(34,211,238,0.16)]"
    : status === "done"
      ? "border-emerald-400/35 bg-emerald-400/10"
      : status === "limited" || status === "partial"
        ? "border-amber-400/45 bg-amber-400/10"
        : status === "failed"
          ? "border-rose-400/45 bg-rose-500/10"
          : "border-slate-700 bg-slate-900/70";

  return (
    <button className="group relative min-w-0 text-left" onClick={onSelect} type="button">
      <div
        className={`h-full rounded-lg border p-3 transition hover:-translate-y-0.5 hover:border-cyan-300/60 ${
          isSelected ? "ring-2 ring-cyan-300/50" : ""
        } ${activeClass}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-white">{agent.name}</p>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              isCurrent
                ? "bg-cyan-300"
                : status === "done"
                  ? "bg-emerald-300"
                  : status === "waiting"
                    ? "bg-slate-500"
                    : "bg-amber-300"
            }`}
          />
        </div>
        <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-slate-400">
          {agent.summary}
        </p>
        <div className="mt-3">
          <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
        </div>
      </div>

      <div className={tooltipClass("left-0 top-[calc(100%+10px)]")}>
        <p className="font-semibold text-cyan-100">{agent.role}</p>
        <p className="mt-2">{agent.detail}</p>
        <div className="mt-3 grid gap-2 border-t border-slate-800 pt-3">
          <p>
            <span className="text-slate-500">输入：</span>
            {agent.input}
          </p>
          <p>
            <span className="text-slate-500">输出：</span>
            {agent.output}
          </p>
        </div>
      </div>
    </button>
  );
}

function McpToolCard({
  name,
  status,
  detail,
}: {
  name: string;
  status: string;
  detail: string;
}) {
  const active = status === "active";
  return (
    <div className="group relative">
      <div
        className={`h-full rounded-lg border p-3 ${
          active
            ? "border-emerald-400/35 bg-emerald-400/10"
            : "border-dashed border-amber-400/40 bg-amber-400/10"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">{name}</p>
          <StatusBadge label={active ? "active" : "pending"} tone={active ? "success" : "warning"} />
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{detail}</p>
      </div>
      <div className={tooltipClass("left-0 top-[calc(100%+10px)]")}>
        <p className="font-semibold text-cyan-100">{name}</p>
        <p className="mt-2">{detail}</p>
        <p className="mt-3 border-t border-slate-800 pt-3 text-slate-500">
          {active ? "当前流程已使用该数据源。" : "后续接入 MCP 后由 CollectorAgent 并行调用。"}
        </p>
      </div>
    </div>
  );
}

function WorkflowDagCanvas({
  taskId,
  displayTaskId,
  taskStatus,
  currentAgent,
  progress,
  agentStatuses,
  hasReport,
  selectedAgent,
  onSelectAgent,
  onNavigate,
}: {
  taskId: string;
  displayTaskId?: string;
  taskStatus?: string;
  currentAgent: string;
  progress: number;
  agentStatuses: Record<string, AgentStatus>;
  hasReport: boolean;
  selectedAgent: string;
  onSelectAgent: (agentName: string) => void;
  onNavigate: (key: string) => void;
}) {
  const activeIndex = currentIndex(currentAgent);
  const completed = normalize(taskStatus) === "completed";

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/75 p-5">
      <FlowStyles />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
            LangGraph DAG
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            多 Agent 协作与 MCP 采集链路
          </h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <StatusBadge label={`任务 ${displayTaskId || taskId}`} tone="info" />
            <StatusBadge label={taskStatus || "waiting"} tone="neutral" />
            <StatusBadge label={`当前 ${currentAgent}`} tone="info" />
            <StatusBadge label={`进度 ${Math.min(100, Math.max(0, progress))}%`} tone="success" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/50 hover:text-cyan-100"
            onClick={() => onNavigate("product-compare")}
            type="button"
          >
            重新选择产品
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
              hasReport
                ? "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                : "cursor-not-allowed bg-slate-800 text-slate-500"
            }`}
            disabled={!hasReport}
            onClick={() => hasReport && onNavigate("report")}
            type="button"
          >
            查看最终报告
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950/80 p-4">
        <div className="mx-auto w-fit rounded-md border border-cyan-300/35 bg-cyan-400/10 px-5 py-3 text-center text-sm font-semibold text-cyan-100">
          LangGraph DAG Agent Workflow
        </div>
        <div className="relative mx-auto h-7 w-px bg-slate-700">
          <span
            className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-cyan-200"
            style={{ animation: "dag-drop 1.4s ease-in-out infinite" }}
          />
        </div>

        <div
          className="grid items-stretch gap-2"
          style={{
            gridTemplateColumns:
              "minmax(105px,1fr) 28px minmax(105px,1fr) 28px minmax(105px,1fr) 28px minmax(105px,1fr) 28px minmax(105px,1fr) 28px minmax(105px,1fr) 28px minmax(105px,1fr)",
          }}
        >
          {AGENTS.map((agent, index) => {
            const arrowActive = completed || (activeIndex >= 0 && index < activeIndex);
            return (
              <div className="contents" key={agent.name}>
                <AgentNode
                  agent={agent}
                  status={agentStatuses[agent.name] ?? "waiting"}
                  isCurrent={currentAgent === agent.name}
                  isSelected={selectedAgent === agent.name}
                  onSelect={() => onSelectAgent(agent.name)}
                />
                {index < AGENTS.length - 1 ? (
                  <FlowArrow active={arrowActive} label={index === 1 ? "facts" : undefined} />
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="ml-[calc((100%/7)+16px)] w-fit">
              <div className="mx-auto h-7 w-px border-l border-dashed border-cyan-300/50" />
              <div className="rounded-md border border-cyan-300/35 bg-cyan-400/10 px-4 py-2 text-center text-sm font-semibold text-cyan-100">
                MCP Tool Layer
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              {MCP_TOOLS.map((tool) => (
                <McpToolCard
                  key={tool.name}
                  name={tool.name}
                  status={tool.status}
                  detail={tool.detail}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
            <p className="text-sm font-semibold text-amber-100">QualityAgent 反馈闭环</p>
            <div className="mt-3 space-y-2">
              {QUALITY_TARGETS.map((target) => (
                <button
                  className="group relative flex w-full items-center gap-2 text-left"
                  key={target.name}
                  onClick={() => onSelectAgent(target.name)}
                  type="button"
                >
                  <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
                    Quality
                  </span>
                  <span className="text-amber-200">↩</span>
                  <span className="rounded-md border border-amber-400/35 bg-slate-950 px-2 py-1 text-xs text-amber-100">
                    {target.name}
                  </span>
                  <div className={tooltipClass("right-0 top-[calc(100%+8px)]")}>
                    <p className="font-semibold text-amber-100">打回条件</p>
                    <p className="mt-2">{target.reason}</p>
                    <p className="mt-2 text-slate-500">三次自动修复仍不足时生成 partial_report。</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AgentCardGrid({
  selectedAgent,
  currentAgent,
  agentStatuses,
  traces,
  onSelectAgent,
}: {
  selectedAgent: string;
  currentAgent: string;
  agentStatuses: Record<string, AgentStatus>;
  traces: Record<string, AgentTrace>;
  onSelectAgent: (agentName: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {AGENTS.map((agent, index) => {
        const status = agentStatuses[agent.name] ?? "waiting";
        const selected = selectedAgent === agent.name;
        const running = currentAgent === agent.name;
        const trace = traces[agent.name];
        return (
          <button
            className={`group min-h-[168px] rounded-lg border p-4 text-left transition hover:-translate-y-1 hover:border-cyan-300/60 ${
              selected
                ? "border-cyan-300/60 bg-cyan-400/10 ring-2 ring-cyan-300/30"
                : running
                  ? "border-cyan-300/50 bg-cyan-400/10"
                  : status === "done"
                    ? "border-emerald-400/35 bg-emerald-400/10"
                    : status === "limited" || status === "partial"
                      ? "border-amber-400/40 bg-amber-400/10"
                      : status === "failed"
                        ? "border-rose-400/45 bg-rose-500/10"
                        : "border-slate-800 bg-slate-950/70"
            }`}
            key={agent.name}
            onClick={() => onSelectAgent(agent.name)}
            style={running ? { animation: "agent-card-pulse 1.8s ease-in-out infinite" } : undefined}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">{agent.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{agent.role}</p>
              </div>
              <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">{agent.summary}</p>
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">
              {trace?.output_summary || "点击查看该 Agent 的详细数据占位。"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function researchTone(status: string): Tone {
  const value = normalize(status);
  if (value === "complete" || value === "active") return "success";
  if (value === "partial") return "warning";
  if (value.includes("pending") || value.includes("mcp_not_connected")) return "warning";
  if (value.includes("fail")) return "danger";
  return "neutral";
}

function productLabelsFromReport(report: Record<string, unknown>) {
  const identities = asRecords(report.product_identification);
  const resolved = asRecords(report.resolved_products);
  const products = identities.length ? identities : resolved;
  const labels = products
    .slice(0, 2)
    .map((item, index) => {
      const label =
        [asString(item.brand), asString(item.model || item.official_model)]
          .filter(Boolean)
          .join(" ") ||
        asString(item.product_name) ||
        asString(item.id);
      return label || `产品 ${index + 1}`;
    })
    .filter(Boolean);

  return labels.length ? labels : ["产品 A（等待 CollectorAgent 识别）", "产品 B（等待 CollectorAgent 识别）"];
}

function formatValue(value: unknown, fallback = "待补齐") {
  if (Array.isArray(value)) return value.length ? value.join(" / ") : fallback;
  if (typeof value === "boolean") return value ? "支持" : "不支持";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function formatDimensions(value: unknown) {
  const dims = asRecord(value);
  const length = asNumber(dims.length);
  const width = asNumber(dims.width);
  const height = asNumber(dims.height);
  if ([length, width, height].every((item) => typeof item === "number")) {
    return `${length} x ${width} x ${height} mm`;
  }
  return "待补齐";
}

function hardwareProductsFromReport(report: Record<string, unknown>) {
  const productScores = asRecord(report.product_scores);
  return asRecords(productScores.products)
    .map((item, index) => {
      const specs = asRecord(item.hardware_specs);
      return {
        id: asString(item.product_id) || asString(item.id) || `product-${index + 1}`,
        label:
          [asString(item.brand), asString(item.model)].filter(Boolean).join(" ") ||
          `产品 ${index + 1}`,
        specs,
      };
    })
    .filter((item) => Object.keys(item.specs).length > 0)
    .slice(0, 2);
}

const HARDWARE_FIELDS = [
  { key: "weight_g", label: "重量", unit: "g" },
  { key: "dimensions_mm", label: "尺寸" },
  { key: "sensor", label: "传感器" },
  { key: "dpi_max", label: "最高 DPI" },
  { key: "polling_rate_hz", label: "回报率", unit: "Hz" },
  { key: "connection", label: "连接方式" },
  { key: "battery_hours", label: "续航", unit: "h" },
  { key: "switch_type", label: "微动" },
  { key: "click_system", label: "点击系统" },
  { key: "software", label: "驱动 / 软件" },
  { key: "onboard_memory", label: "板载内存" },
  { key: "mold_id", label: "模具 ID" },
];

function hardwareValue(specs: Record<string, unknown>, key: string, unit?: string) {
  if (key === "dimensions_mm") return formatDimensions(specs[key]);
  const value = specs[key];
  if (typeof value === "number" && Number.isFinite(value) && unit) return `${value}${unit}`;
  return formatValue(value);
}

function hasUsefulHardware(product: { specs: Record<string, unknown> }) {
  return HARDWARE_FIELDS.some((field) => hardwareValue(product.specs, field.key, field.unit) !== "待补齐");
}

function HardwareMiniTable({ products }: { products: ReturnType<typeof hardwareProductsFromReport> }) {
  if (products.length < 2) {
    return (
      <div className="rounded-md border border-amber-400/25 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100">
        本地 JSON 暂未同时命中两款产品，硬件参数等待官网规格 MCP 补齐。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950/70">
      <div className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-800 bg-slate-900/70 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        <div className="p-3">字段</div>
        {products.map((product) => (
          <div className="min-w-0 p-3 text-slate-300" key={product.id}>
            {product.label}
          </div>
        ))}
      </div>
      {HARDWARE_FIELDS.map((field) => (
        <div
          className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-800/80 last:border-b-0"
          key={field.key}
        >
          <div className="p-3 text-xs text-slate-500">{field.label}</div>
          {products.map((product) => (
            <div className="min-w-0 break-words p-3 text-sm text-slate-200" key={product.id}>
              {hardwareValue(product.specs, field.key, field.unit)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function HardwareDataPanel({
  products,
  officialNeed,
}: {
  products: ReturnType<typeof hardwareProductsFromReport>;
  officialNeed: boolean;
}) {
  const localAvailable = products.length >= 2 && products.every(hasUsefulHardware);
  const usefulCount = products.filter(hasUsefulHardware).length;
  const localLabel = localAvailable ? "有" : usefulCount > 0 ? "部分命中" : "未命中";
  const localDescription = localAvailable
    ? "已命中两款产品，下方直接展示本地硬件字段。"
    : usefulCount > 0
      ? `仅命中 ${usefulCount} 款产品，另一款需要搜索/官网 MCP 识别后补齐。`
      : "两款输入均未完整命中本地事实库，当前没有可展示的硬件参数。";
  const missingNotice = usefulCount > 0
    ? "当前输入没有完整命中本地产品事实库。后续接入搜索/官网 MCP 后，将补齐缺失产品的官方型号与硬件参数；在此之前不生成硬件赢家判断。"
    : "当前输入未命中本地产品事实库。硬件参数、官方型号和赢家判断都需要等待搜索/官网 MCP 采集后生成。";

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Hardware Data
          </p>
          <h4 className="mt-2 text-lg font-semibold text-white">硬件数据状态</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={`本地 JSON：${localLabel}`} tone={localAvailable ? "success" : "warning"} />
          <StatusBadge label={`官网补齐：${officialNeed ? "需要" : "不需要"}`} tone={officialNeed ? "warning" : "success"} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-cyan-300/25 bg-cyan-400/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-cyan-100">本地 JSON 硬件事实</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {localDescription}
              </p>
            </div>
            <StatusBadge label={localAvailable ? "有" : usefulCount > 0 ? "部分" : "没有"} tone={localAvailable ? "success" : "warning"} />
          </div>
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">官网规格补齐</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {officialNeed
                  ? "本地硬件事实不足，需要 OfficialSpec MCP 补齐。"
                  : "本地已有稳定硬件事实，当前不需要官网补齐。"}
              </p>
            </div>
            <StatusBadge label={officialNeed ? "需要" : "不需要"} tone={officialNeed ? "warning" : "success"} />
          </div>
        </div>
      </div>

      <div className="mt-4">
        {localAvailable ? (
          <HardwareMiniTable products={products} />
        ) : (
          <div className="rounded-md border border-dashed border-amber-400/35 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            {missingNotice}
          </div>
        )}
      </div>
    </div>
  );
}

function ResearchAgentPlanningDetail({
  agent,
  status,
  trace,
  report,
}: {
  agent: AgentDefinition;
  status: AgentStatus;
  trace?: AgentTrace;
  report: Record<string, unknown>;
}) {
  const productLabels = productLabelsFromReport(report);
  const hardwareProducts = hardwareProductsFromReport(report);
  const localHardwareAvailable = hardwareProducts.length >= 2 && hardwareProducts.every(hasUsefulHardware);
  const officialNeed = !localHardwareAvailable;
  const knownProductCount = hardwareProducts.filter(hasUsefulHardware).length;
  const localHardwareStatus =
    localHardwareAvailable ? "ready" : knownProductCount > 0 ? "partial" : "missing";
  const targetDataCards = [
    {
      title: "本地硬件事实",
      tone:
        localHardwareStatus === "ready"
          ? "已准备"
          : localHardwareStatus === "partial"
            ? "部分命中"
            : "未命中",
      body: localHardwareAvailable
        ? "两款产品均命中本地 JSON，可直接读取重量、尺寸、传感器、DPI、回报率、连接、续航、微动、点击系统、驱动与板载内存。"
        : knownProductCount > 0
          ? `当前仅有 ${knownProductCount} 款产品命中本地事实库，缺失产品需要交给搜索/官网 MCP 识别并补齐。`
          : "两款输入均未命中本地产品事实库，当前不能生成硬件参数对比或赢家判断，需要先交给搜索/官网 MCP 识别官方型号。",
    },
    {
      title: "官网规格核验",
      tone: officialNeed ? "待采集" : "暂不需要",
      body: officialNeed
        ? "用于确认官方型号、参数页、固件更新、驱动说明和地区版本差异；采集完成前不输出硬件赢家结论。"
        : "本地已有稳定硬件参数，官网规格只作为后续复核来源，不参与当前基础事实判断。",
    },
    {
      title: "评价与测评情报",
      tone: "pending",
      body: "用户口碑、博主测评、握法手感、游戏适配和长期可靠性目前不写死，后续由 ReviewIntel MCP 与 LLM 摘要补齐。",
    },
    {
      title: "实时价格",
      tone: "pending",
      body: "价格会随时间变化，当前只规划采集任务，不从本地 JSON 生成性价比结论。",
    },
  ];
  const handoffCards = [
    "CollectorAgent：先查本地事实库；未命中时生成搜索/官网 MCP 待采集任务。",
    "EvidenceAgent：把硬件事实、来源状态和待补项整理成可追溯 evidence。",
    "AnalysisAgent：只分析有 evidence 支撑的硬件差异，不提前输出体验结论。",
    "QualityAgent：检查 pending 是否披露、结论是否都有证据支撑。",
  ];
  const researchQuestion = localHardwareAvailable
    ? "本次先确认两款电竞鼠标的可验证硬件事实差异，再规划外部数据采集：官网规格用于复核参数，用户评价和博主测评用于体验判断，实时价格用于后续性价比分析。"
    : "本次先把两个输入作为待识别产品处理：先规划搜索/官网 MCP 确认官方型号和硬件参数，再进入评价测评、实时价格和质量校验；采集完成前不生成硬件赢家或最终推荐。";
  const researchSummary = localHardwareAvailable
    ? (trace?.output_summary || "已规划本地事实读取、官网复核、评价测评、实时价格与质量校验任务。")
    : (trace?.output_summary || "本地事实库未完整命中，已规划搜索/官网 MCP 识别、规格补齐、评价测评和价格采集任务。");
  const researchRequirements = RESEARCH_REQUIREMENTS.map((item) => {
    if (item.name !== "硬件数据") return item;
    return {
      ...item,
      status: localHardwareAvailable ? "complete" : "pending",
      summary: localHardwareAvailable
        ? "本地 JSON 已命中两款产品，当前可以展示硬件事实；官网规格后续仅用于复核。"
        : "本地 JSON 未完整命中两款产品，硬件参数、官方型号和赢家判断都等待搜索/官网 MCP 采集后再生成。",
    };
  });

  return (
    <section className="rounded-lg border border-cyan-300/25 bg-slate-950/75 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Research Plan
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{agent.name}</h3>
          <p className="mt-1 text-sm text-slate-400">
            调研规划员：把用户输入拆成可执行的数据任务，明确哪些本地已有、哪些需要后续 MCP 补齐。
          </p>
        </div>
        <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
      </div>

      <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
        ResearchAgent 不做最终推荐，不判断谁更适合；它只规划数据需求。用户评价、博主测评、
        实时价格和长期可靠性当前都是占位，等 MCP 与 LLM 摘要接入后替换为真实结果。
      </div>

      <div className="mt-5 grid gap-4">
        <div className="h-fit rounded-lg border border-slate-800 bg-slate-900/45 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Research Target
              </p>
              <h4 className="mt-2 text-lg font-semibold text-white">本次调研目标</h4>
            </div>
            <StatusBadge label="planning only" tone="info" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {productLabels.map((label, index) => (
              <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3" key={label}>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  产品 {index === 0 ? "A" : "B"}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-100">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Research Question
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              {researchQuestion}
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {targetDataCards.map((item) => (
              <article
                className="rounded-md border border-slate-800 bg-slate-950/60 p-3"
                key={item.title}
              >
                <div className="flex items-start justify-between gap-3">
                  <h5 className="text-sm font-semibold text-slate-100">{item.title}</h5>
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-xs font-semibold text-cyan-100">
                    {item.tone}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{item.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Handoff
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {handoffCards.map((item) => (
                <div className="rounded-md border border-slate-800/80 bg-slate-900/50 px-3 py-2 text-xs leading-5 text-slate-300" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            当前计划摘要：{researchSummary}
          </p>
        </div>

        <HardwareDataPanel officialNeed={officialNeed} products={hardwareProducts} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Requirement Matrix
              </p>
              <h4 className="mt-2 text-lg font-semibold text-white">数据需求矩阵</h4>
            </div>
            <StatusBadge label="pending 不等于失败" tone="warning" />
          </div>
          <div className="mt-4 space-y-3">
            {researchRequirements.map((item) => (
              <article
                className="rounded-md border border-slate-800 bg-slate-950/55 p-3 transition hover:border-cyan-300/40"
                key={item.name}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h5 className="font-semibold text-slate-100">{item.name}</h5>
                      <StatusBadge label={item.status} tone={researchTone(item.status)} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.owner}</p>
                  </div>
                  <StatusBadge
                    label={
                      item.status === "complete"
                        ? "已准备"
                        : item.status === "partial"
                          ? "部分事实"
                          : "等待采集"
                    }
                    tone={researchTone(item.status)}
                  />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">{item.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.fields.slice(0, 6).map((field) => (
                    <span
                      className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"
                      key={field}
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Source Priority
            </p>
            <h4 className="mt-2 text-lg font-semibold text-white">数据来源优先级</h4>
            <div className="mt-4 space-y-3">
              {SOURCE_PRIORITIES.map((source) => (
                <div className="grid gap-3 rounded-md border border-slate-800 bg-slate-950/55 p-3 sm:grid-cols-[56px_1fr]" key={source.level}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-400/10 text-sm font-semibold text-cyan-100">
                    {source.level}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-100">{source.name}</p>
                      <StatusBadge label={source.credibility} tone={source.level === "P3" ? "warning" : "success"} />
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{source.usage}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Handoff
                </p>
                <h4 className="mt-2 text-lg font-semibold text-white">交给后续 Agent 的任务包</h4>
              </div>
              <StatusBadge label={`${RESEARCH_HANDOFFS.length} tasks`} tone="info" />
            </div>
            <div className="mt-4 space-y-3">
              {RESEARCH_HANDOFFS.map((handoff, index) => (
                <div className="flex gap-3 rounded-md border border-slate-800 bg-slate-950/55 p-3" key={handoff.agent}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/35 text-xs font-semibold text-cyan-100">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-100">{handoff.agent}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{handoff.task}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}

function AgentDetailPlaceholder({
  agent,
  status,
  trace,
  report,
}: {
  agent: AgentDefinition;
  status: AgentStatus;
  trace?: AgentTrace;
  report: Record<string, unknown>;
}) {
  if (agent.name === "ResearchAgent") {
    return (
      <ResearchAgentPlanningDetail
        agent={agent}
        report={report}
        status={status}
        trace={trace}
      />
    );
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/75 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Agent Detail
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{agent.name}</h3>
          <p className="mt-1 text-sm text-slate-400">{agent.role}</p>
        </div>
        <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">输入</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{agent.input}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">输出</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{agent.output}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">当前摘要</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {trace?.output_summary || "这里先预留详情区域，下一步可放输入、输出、证据、prompt、token、MCP 调用等数据。"}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-dashed border-cyan-300/30 bg-cyan-400/5 p-4 text-sm leading-6 text-slate-400">
        详情内容先留空位。下一步你告诉我每个 Agent 里面要展示哪些字段，我再把这里改成真正的数据面板。
      </div>
    </section>
  );
}

function AgentWorkbench({
  selectedAgent,
  onOpenAgent,
  currentAgent,
  agentStatuses,
  traces,
}: {
  selectedAgent: string;
  onOpenAgent: (agentName: string) => void;
  currentAgent: string;
  agentStatuses: Record<string, AgentStatus>;
  traces: Record<string, AgentTrace>;
}) {
  const selected = AGENTS.find((agent) => agent.name === selectedAgent) ?? AGENTS[0];

  return (
    <section className="mt-5 rounded-lg border border-slate-800 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Agent Cards
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">七个 Agent 任务卡片</h3>
        </div>
        <p className="text-sm text-slate-500">
          点击左侧控制台 Agent 任务栏或下方卡片，会进入对应 Agent 的独立详情页。
        </p>
      </div>
      <div className="mt-4">
        <AgentCardGrid
          agentStatuses={agentStatuses}
          currentAgent={currentAgent}
          onSelectAgent={onOpenAgent}
          selectedAgent={selected.name}
          traces={traces}
        />
      </div>
    </section>
  );
}

function CompetitiveReportEntry({
  hasReport,
  onNavigate,
}: {
  hasReport: boolean;
  onNavigate: (key: string) => void;
}) {
  return (
    <section className="mt-5 rounded-lg border border-cyan-300/25 bg-slate-950/75 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Competitive Report
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">竞品分析报告</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Agent 工作流完成后，最终报告会汇总硬件事实、证据限制、pending 数据和综合建议。
          </p>
        </div>
        <button
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            hasReport
              ? "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              : "cursor-not-allowed border border-slate-700 bg-slate-900/80 text-slate-500"
          }`}
          disabled={!hasReport}
          onClick={() => hasReport && onNavigate("report")}
          type="button"
        >
          {hasReport ? "查看最终报告" : "等待报告生成"}
        </button>
      </div>
    </section>
  );
}

function AgentDetailPage({
  agent,
  status,
  trace,
  report,
  onBack,
}: {
  agent: AgentDefinition;
  status: AgentStatus;
  trace?: AgentTrace;
  report: Record<string, unknown>;
  onBack: () => void;
}) {
  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/75 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Agent Detail Page
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{agent.name}</h2>
          <p className="mt-1 text-sm text-slate-400">{agent.role}</p>
        </div>
        <button
          className="rounded-md border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/50 hover:text-cyan-100"
          onClick={onBack}
          type="button"
        >
          返回 Agent 工作流
        </button>
      </div>
      <AgentDetailPlaceholder
        agent={agent}
        report={report}
        status={status}
        trace={trace}
      />
    </section>
  );
}

export function WorkflowPage({
  taskId,
  displayTaskId,
  agentDetailName,
  onAgentOpen,
  onAgentDetailClose,
  selectedAgent,
  onSelectedAgentChange,
  onSidebarAgentsChange,
  onNavigate,
}: WorkflowPageProps) {
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [traceLog, setTraceLog] = useState<AgentTrace[]>([]);
  const [quality, setQuality] = useState<QualityResult | undefined>();
  const [reportResponse, setReportResponse] = useState<ReportResponse | FinalReport | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactsSummary | null>(null);
  const [risks, setRisks] = useState<Record<string, unknown>[]>([]);
  const [errors, setErrors] = useState<ErrorLogItem[]>([]);
  const [reviewTicket, setReviewTicket] = useState<ReviewTicket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    const activeTaskId: string = taskId;
    let cancelled = false;
    let inFlight = false;
    let timer: number | undefined;

    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      setIsRefreshing(true);
      try {
        const [nextStatus, nextTrace, nextQuality, nextReport, nextArtifacts, nextRisks, nextErrors] =
          await Promise.all([
            analysisApi.getStatus(activeTaskId),
            analysisApi.getTrace(activeTaskId),
            analysisApi.getQuality(activeTaskId),
            analysisApi.getReport(activeTaskId),
            analysisApi.getArtifacts(activeTaskId),
            analysisApi.getRisks(activeTaskId),
            analysisApi.getErrors(activeTaskId),
          ]);
        if (cancelled) return;
        setStatus(nextStatus);
        setTraceLog(Array.isArray(nextTrace.trace_log) ? nextTrace.trace_log : []);
        setQuality(nextQuality.quality_result);
        setReportResponse(nextReport as ReportResponse);
        setArtifacts(nextArtifacts);
        setRisks(asRecords(nextRisks.risk_flags));
        setErrors(Array.isArray(nextErrors.error_log) ? nextErrors.error_log : []);
        setReviewTicket(nextTrace.review_ticket ?? nextQuality.review_ticket ?? null);
        setError(null);
        if (nextStatus.current_agent && nextStatus.current_agent !== "ReportAgent") {
          onSelectedAgentChange(nextStatus.current_agent);
        }
        if (isFinalDone(nextStatus) && timer) {
          window.clearInterval(timer);
          timer = undefined;
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(refreshError instanceof Error ? refreshError.message : "刷新工作流失败");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
        inFlight = false;
      }
    }

    setIsLoading(true);
    refresh();
    timer = window.setInterval(refresh, 1600);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [taskId, onSelectedAgentChange]);

  const report = useMemo(() => extractReport(reportResponse), [reportResponse]);
  const traceByAgent = useMemo(() => traceMap(traceLog), [traceLog]);
  const qualityStatus = qualityStatusText(status, quality, reportResponse, report);
  const hasReport = Boolean(
    artifacts?.has_final_report || Object.keys(report).length > 0 || status?.current_agent === "ReportAgent",
  );
  const progress = status?.progress ?? Math.round((traceLog.length / AGENTS.length) * 100);
  const currentAgent = status?.current_agent || "等待任务";

  const agentStatuses = useMemo(() => AGENTS.reduce<Record<string, AgentStatus>>((acc, agent) => {
    acc[agent.name] = deriveStatus(agent, traceByAgent[agent.name], status, qualityStatus, hasReport);
    return acc;
  }, {}), [hasReport, qualityStatus, status, traceByAgent]);

  useEffect(() => {
    onSidebarAgentsChange?.(
      AGENTS.map((agent) => ({
        name: agent.name,
        role: agent.role,
        status: agentStatuses[agent.name] ?? "waiting",
        current: currentAgent === agent.name,
        selected: agentDetailName === agent.name,
      })),
    );

    return () => {
      onSidebarAgentsChange?.([]);
    };
  }, [agentDetailName, agentStatuses, currentAgent, onSidebarAgentsChange]);

  const detailAgent = agentDetailName
    ? (AGENTS.find((agent) => agent.name === agentDetailName) ?? null)
    : null;

  if (!taskId) {
    return (
      <section className="mx-auto max-w-5xl">
        <EmptyState
          action={
            <button
              className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              onClick={() => onNavigate("product-compare")}
              type="button"
            >
              回到产品输入
            </button>
          }
          description="先输入两款电竞鼠标并点击开始分析，系统才会进入多 Agent 工作流。"
          title="暂无分析任务"
        />
      </section>
    );
  }

  if (detailAgent) {
    return (
      <section>
        {isLoading ? <LoadingState label="正在读取 Agent 详情..." /> : null}
        {error ? (
          <div className="mb-5 rounded-md border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}
        <AgentDetailPage
          agent={detailAgent}
          onBack={onAgentDetailClose}
          report={report}
          status={agentStatuses[detailAgent.name] ?? "waiting"}
          trace={traceByAgent[detailAgent.name]}
        />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl">
      <WorkflowDagCanvas
        agentStatuses={agentStatuses}
        currentAgent={currentAgent}
        displayTaskId={displayTaskId}
        hasReport={hasReport}
        onNavigate={onNavigate}
        onSelectAgent={onAgentOpen}
        progress={progress}
        selectedAgent={selectedAgent}
        taskId={taskId}
        taskStatus={status?.status}
      />

      {isLoading ? <LoadingState label="正在读取工作流状态..." /> : null}

      {error ? (
        <div className="mt-5 rounded-md border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <AgentWorkbench
        agentStatuses={agentStatuses}
        currentAgent={currentAgent}
        selectedAgent={selectedAgent}
        onOpenAgent={onAgentOpen}
        traces={traceByAgent}
      />
      <CompetitiveReportEntry hasReport={hasReport} onNavigate={onNavigate} />
    </section>
  );
}
