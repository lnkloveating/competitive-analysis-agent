import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { StatusBadge } from "../components/common/StatusBadge";
import {
  ProductSearchCombobox,
  ProductThumb,
} from "../components/common/ProductSearchCombobox";
import { analysisApi } from "../api/analysisApi";
import { productApi, DEFAULT_PRODUCT_CATEGORY } from "../api/productApi";
import { getSourceTypeLabel } from "../utils/labels";
import type { StartAnalysisRequest } from "../types/analysis";
import type {
  GamingMouseProduct,
  ProductCompareResponse,
  ProductScoreboard,
  ProductSearchResult,
  ProductSourceSummary,
  SpecDifference,
} from "../types/product";

type ProductComparePageProps = {
  displayTaskId?: string;
  onNavigate?: (key: string) => void;
  onTaskCreated?: (taskId: string) => void;
};

// A 侧统一青色，B 侧统一紫色，全页用颜色区分两款产品。
type Side = "a" | "b";

const AGENT_ANALYSIS_DIMENSIONS = [
  "性能参数",
  "轻量化设计",
  "无线与续航",
  "软件生态",
  "用户口碑",
  "价格定位",
  "电竞品牌影响力",
  "握持手感与人体工学",
];

const SIDE_THEME: Record<
  Side,
  { text: string; bar: string; ring: string; soft: string; chipBorder: string }
> = {
  a: {
    text: "text-cyan-200",
    bar: "bg-cyan-400",
    ring: "ring-cyan-300/40",
    soft: "bg-cyan-400/10",
    chipBorder: "border-cyan-300/40",
  },
  b: {
    text: "text-violet-200",
    bar: "bg-violet-400",
    ring: "ring-violet-300/40",
    soft: "bg-violet-400/10",
    chipBorder: "border-violet-300/40",
  },
};

// 技术值 -> 中文展示
const CONNECTION_LABELS: Record<string, string> = {
  wired: "有线",
  "2.4ghz": "2.4G 无线",
  bluetooth: "蓝牙",
};

const SHAPE_LABELS: Record<string, string> = {
  symmetrical: "对称（双手）",
  ergonomic: "人体工学（右手）",
};

function connectionLabel(value: string): string {
  return CONNECTION_LABELS[value] ?? value;
}

function shapeLabel(value?: string | null): string {
  if (!value) return "—";
  return SHAPE_LABELS[value] ?? value;
}

function fmt(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}${suffix}`;
}

function fieldConfidenceSummaryLine(summary: unknown): string {
  if (!summary || typeof summary !== "object") return "";
  const record = summary as Record<string, unknown>;
  const count = (key: string) => (Array.isArray(record[key]) ? (record[key] as unknown[]).length : 0);
  const official = count("official");
  const review = count("review_verified");
  const inferred = count("rule_inferred");
  const community = count("community_likely") + count("community_unverified");
  const parts = [
    official ? `官方 ${official} 项` : "",
    review ? `评测验证 ${review} 项` : "",
    inferred ? `规则推断 ${inferred} 项` : "",
    community ? `社区简称 ${community} 项` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function fieldConfidenceFields(summary: unknown, key: string): string {
  if (!summary || typeof summary !== "object") return "";
  const value = (summary as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.slice(0, 4).join("、") : "";
}

function priceText(product: GamingMouseProduct): string {
  const cny = product.price_range?.cny;
  if (Array.isArray(cny) && cny.length >= 1) {
    const [min, max] = [cny[0], cny[cny.length - 1]];
    return min === max ? `¥${min}` : `¥${min} - ${max}`;
  }
  const usd = product.price_range?.usd;
  if (Array.isArray(usd) && usd.length >= 1) {
    const [min, max] = [usd[0], usd[usd.length - 1]];
    return min === max ? `$${min}` : `$${min} - ${max}`;
  }
  return "—";
}

function productName(product: GamingMouseProduct): string {
  return `${product.brand} ${product.model}`;
}

function buildAnalysisPayload(
  productA: GamingMouseProduct,
  productB: GamingMouseProduct,
): StartAnalysisRequest {
  // 产品对比模式：把所选两款产品作为结构化事实底座传给后端。
  // competitors 用具体型号（后端会据此把质检范围收敛到这两款产品）。
  return {
    industry_key: productA.category || "gaming_mouse",
    target_platform: productA.model,
    competitors: [productA.model, productB.model],
    analysis_scene: `电竞鼠标产品对比：${productName(productA)} vs ${productName(productB)}`,
    target_user: "电竞外设购买决策用户",
    time_range: "近两年",
    focus_dimensions: AGENT_ANALYSIS_DIMENSIONS,
    selected_products: [
      { id: productA.id, model: productA.model, brand: productA.brand, category: productA.category },
      { id: productB.id, model: productB.model, brand: productB.brand, category: productB.category },
    ],
  };
}

// 每个数值字段在“胜方”上要展示的措辞
const WINNER_VERB: Record<string, string> = {
  weight_g: "更轻",
  dpi_max: "DPI 更高",
  polling_rate_hz: "回报率更高",
  battery_hours: "续航更长",
};

// ---------------------------------------------------------------------------
// 搜索选择器：未选中时展示带图候选卡片的 Combobox，已选中时展示产品卡片。
// ---------------------------------------------------------------------------
function ProductPicker({
  side,
  label,
  category,
  selected,
  onSelect,
  onClear,
}: {
  side: Side;
  label: string;
  category: string;
  selected: ProductSearchResult | null;
  onSelect: (result: ProductSearchResult) => void;
  onClear: () => void;
}) {
  const theme = SIDE_THEME[side];

  return (
    <div
      className={`rounded-xl border bg-slate-950/70 p-4 shadow-[0_18px_50px_rgba(2,6,23,0.18)] ${
        selected ? `${theme.chipBorder} ${theme.soft}` : "border-slate-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${theme.soft} ${theme.text} ring-1 ${theme.ring}`}
        >
          {side === "a" ? "A" : "B"}
        </span>
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
          {label}
        </span>
      </div>

      {selected ? (
        <div className="mt-3 flex items-start gap-3">
          <ProductThumb
            src={selected.product.image_url}
            alt={selected.product.image_alt || `${selected.brand} ${selected.model}`}
            accent={side === "a" ? "cyan" : "violet"}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400">{selected.brand}</p>
            <p className="truncate text-lg font-semibold text-white">
              {selected.model}
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500">{selected.id}</p>
          </div>
          <button
            className="shrink-0 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-300 hover:text-cyan-100"
            onClick={onClear}
            type="button"
          >
            更换
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <ProductSearchCombobox
            category={category}
            accent={side === "a" ? "cyan" : "violet"}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 可视化小组件
// ---------------------------------------------------------------------------
// 头对头双条形：A 青 / B 紫，长度按数值占比，胜方加标记。
function HeadToHeadBar({
  valueA,
  valueB,
  unit = "",
  winner,
  winnerVerb,
}: {
  valueA: number | null;
  valueB: number | null;
  unit?: string;
  winner?: Side | null;
  winnerVerb?: string;
}) {
  const max = Math.max(1, valueA ?? 0, valueB ?? 0);
  const rows: Array<{ side: Side; value: number | null }> = [
    { side: "a", value: valueA },
    { side: "b", value: valueB },
  ];

  return (
    <div className="space-y-2">
      {rows.map(({ side, value }) => {
        const theme = SIDE_THEME[side];
        const ratio = value === null ? 0 : value / max;
        const isWinner = winner === side;
        return (
          <div key={side} className="flex items-center gap-3">
            <span className={`w-4 shrink-0 text-xs font-bold ${theme.text}`}>
              {side.toUpperCase()}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-800/80">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${theme.bar} ${
                  isWinner ? "" : "opacity-70"
                }`}
                style={{ width: `${Math.max(value === null ? 0 : 3, ratio * 100)}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-sm font-semibold text-slate-100">
              {value === null ? "—" : `${value}${unit}`}
              {isWinner && winnerVerb ? (
                <span className={`ml-1 text-[11px] font-medium ${theme.text}`}>
                  ✓ {winnerVerb}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 数值参数卡：A / B 并排，胜方高亮 + 差值
function ParamCard({ diff }: { diff: SpecDifference }) {
  const a = typeof diff.a === "number" ? diff.a : null;
  const b = typeof diff.b === "number" ? diff.b : null;
  const winner: Side | null =
    diff.advantage === "a" ? "a" : diff.advantage === "b" ? "b" : null;

  function valueCell(side: Side, value: number | null) {
    const theme = SIDE_THEME[side];
    const isWinner = winner === side;
    return (
      <div
        className={`flex-1 rounded-lg border px-3 py-2 text-center transition ${
          isWinner
            ? `${theme.chipBorder} ${theme.soft} ring-1 ${theme.ring}`
            : "border-slate-800 bg-slate-900/40"
        }`}
      >
        <p className={`text-[11px] font-semibold ${theme.text}`}>
          {side.toUpperCase()}
        </p>
        <p className="mt-0.5 text-lg font-semibold text-slate-50">
          {value === null ? "—" : value.toLocaleString()}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-300">{diff.label}</p>
        {winner && typeof diff.abs_diff === "number" && diff.abs_diff > 0 ? (
          <span className={`text-xs font-medium ${SIDE_THEME[winner].text}`}>
            {WINNER_VERB[diff.field] ?? "占优"} · 差 {diff.abs_diff.toLocaleString()}
          </span>
        ) : (
          <span className="text-xs text-slate-500">
            {diff.comparable === false ? "数据不全" : "持平"}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-stretch gap-2">
        {valueCell("a", a)}
        {valueCell("b", b)}
      </div>
    </div>
  );
}

// 标签型对比行（连接 / 形状 / 软件 / 板载内存）
function AttributeRow({
  label,
  aNode,
  bNode,
  equal,
  note,
}: {
  label: string;
  aNode: React.ReactNode;
  bNode: React.ReactNode;
  equal?: boolean | null;
  note?: string;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 sm:grid-cols-[140px_1fr_auto]">
      <p className="text-sm font-medium text-slate-300">{label}</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-cyan-300">A</span>
          <span className="text-sm text-slate-100">{aNode}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-violet-300">B</span>
          <span className="text-sm text-slate-100">{bNode}</span>
        </div>
      </div>
      <div className="justify-self-start sm:justify-self-end">
        {equal === true ? (
          <StatusBadge label="一致" tone="neutral" />
        ) : equal === false ? (
          <StatusBadge label={note ?? "不同"} tone="info" />
        ) : (
          <StatusBadge label="数据不全" tone="warning" />
        )}
      </div>
    </div>
  );
}

// 产品头部卡片
function ProductHeader({
  side,
  product,
}: {
  side: Side;
  product: GamingMouseProduct;
}) {
  const theme = SIDE_THEME[side];
  return (
    <div
      className={`flex-1 rounded-xl border bg-slate-950/70 p-5 ring-1 ${theme.chipBorder} ${theme.ring}`}
    >
      <div className="flex items-start gap-4">
        <ProductThumb
          src={product.image_url}
          alt={product.image_alt || productName(product)}
          accent={side === "a" ? "cyan" : "violet"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${theme.soft} ${theme.text}`}
            >
              {side.toUpperCase()}
            </span>
            <span className="text-xs text-slate-400">{product.brand}</span>
          </div>
          <h3 className="mt-2 truncate text-xl font-semibold text-white">
            {product.model}
          </h3>
          <p className="mt-1 truncate text-xs text-slate-500">{product.sensor}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-slate-300">
          {shapeLabel(product.shape)}
        </span>
        <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-slate-300">
          参考价 {priceText(product)}
        </span>
        {product.release_year ? (
          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-slate-300">
            {product.release_year} 年
          </span>
        ) : null}
      </div>
    </div>
  );
}

// 来源卡片
function SourceCard({
  side,
  product,
  summary,
}: {
  side: Side;
  product: GamingMouseProduct;
  summary: ProductSourceSummary;
}) {
  const theme = SIDE_THEME[side];
  return (
    <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${theme.soft} ${theme.text}`}
          >
            {side.toUpperCase()}
          </span>
          <p className="truncate text-sm font-semibold text-white">{product.model}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge label={`来源 ${summary.source_count}`} tone="neutral" />
          <StatusBadge label={`官方 ${summary.official_count}`} tone="success" />
        </div>
      </div>

      {summary.official_url ? (
        <a
          className="mt-3 block truncate text-xs text-cyan-200 transition hover:text-cyan-100 hover:underline"
          href={summary.official_url}
          rel="noreferrer"
          target="_blank"
          title={summary.official_url}
        >
          官方页：{summary.official_url}
        </a>
      ) : null}

      <ul className="mt-3 space-y-2">
        {summary.sources.map((source, index) => (
          <li
            key={`${source.url ?? source.title ?? index}`}
            className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm text-slate-100">
                {source.url ? (
                  <a
                    className="transition hover:text-cyan-100 hover:underline"
                    href={source.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {source.title ?? source.url}
                  </a>
                ) : (
                  source.title ?? "未命名来源"
                )}
              </span>
              <StatusBadge
                label={getSourceTypeLabel(source.source_type)}
                tone={source.source_type === "official" ? "success" : "info"}
              />
            </div>
            {source.publisher ? (
              <p className="mt-1 text-xs text-slate-500">{source.publisher}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {summary.updated_at ? (
        <p className="mt-3 text-xs text-slate-500">更新于 {summary.updated_at}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 产品评分（基于硬件 JSON，独立于报告 quality_score）
// ---------------------------------------------------------------------------
function fmtScore(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(1) : "—";
}

function scoreWinner(a: number | null, b: number | null): Side | null {
  if (typeof a !== "number" || typeof b !== "number" || a === b) return null;
  return a > b ? "a" : "b";
}

function ScoreBar({ side, value, win }: { side: Side; value: number | null; win: boolean }) {
  const theme = SIDE_THEME[side];
  const pct = typeof value === "number" ? Math.max(2, Math.min(100, value)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-4 shrink-0 text-xs font-bold ${theme.text}`}>{side.toUpperCase()}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800/80">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${theme.bar} ${win ? "" : "opacity-60"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-sm font-semibold text-slate-100">
        {fmtScore(value)}
      </span>
    </div>
  );
}

function ScoreMetric({
  label,
  a,
  b,
}: {
  label: string;
  a: number | null;
  b: number | null;
}) {
  const winner = scoreWinner(a, b);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        {winner ? (
          <span className={`shrink-0 text-[11px] font-medium ${SIDE_THEME[winner].text}`}>
            {winner.toUpperCase()} 更高
          </span>
        ) : (
          <span className="shrink-0 text-[11px] text-slate-500">持平 / 数据不全</span>
        )}
      </div>
      <div className="space-y-1.5">
        <ScoreBar side="a" value={a} win={winner === "a"} />
        <ScoreBar side="b" value={b} win={winner === "b"} />
      </div>
    </div>
  );
}

function ProductScoreboardSection({ scores }: { scores: ProductScoreboard }) {
  const a = scores.product_a;
  const b = scores.product_b;
  const v = scores.verdicts ?? {};
  const specA = a.hardware_specs ?? {};
  const specB = b.hardware_specs ?? {};
  const pairs: Array<[Side, typeof a]> = [
    ["a", a],
    ["b", b],
  ];
  const dimsText = (dims: typeof specA.dimensions_mm) =>
    dims
      ? [dims.length, dims.width, dims.height].filter((value) => value != null).join(" × ")
      : "—";
  const connText = (conn?: string[]) =>
    Array.isArray(conn) && conn.length ? conn.map(connectionLabel).join(" / ") : "—";
  const boolText = (value: unknown) =>
    value === true ? "支持" : value === false ? "不支持" : "—";
  const specRows = [
    ["重量", fmt(specA.weight_g, " g"), fmt(specB.weight_g, " g")],
    ["尺寸", dimsText(specA.dimensions_mm), dimsText(specB.dimensions_mm)],
    ["形状", shapeLabel(specA.shape), shapeLabel(specB.shape)],
    ["模具 ID", specA.mold_id || "—", specB.mold_id || "—"],
    ["传感器", specA.sensor || "—", specB.sensor || "—"],
    ["最高 DPI", fmt(specA.dpi_max), fmt(specB.dpi_max)],
    ["回报率", fmt(specA.polling_rate_hz, " Hz"), fmt(specB.polling_rate_hz, " Hz")],
    ["连接方式", connText(specA.connection), connText(specB.connection)],
    ["标称续航", fmt(specA.battery_hours, " h"), fmt(specB.battery_hours, " h")],
    ["微动 / 点击系统", specA.switch_type || specA.click_system || "—", specB.switch_type || specB.click_system || "—"],
    ["驱动软件", specA.software || "—", specB.software || "—"],
    ["板载存储", boolText(specA.onboard_memory), boolText(specB.onboard_memory)],
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-white">基础硬件快评</h3>
        <span className="text-[11px] text-slate-500">本地事实库即时判断 · 非最终综合评分</span>
      </div>
      <p className="mb-3 text-xs leading-5 text-slate-500">
        {scores.score_type_note ??
          "基础硬件快评基于本地产品 JSON，与报告可信度 quality_score 相互独立；Agent 深度分析后才生成最终购买建议。"}
      </p>
      <div className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[11px] leading-5 text-amber-100/80">
        <span className="font-semibold text-amber-100">非最终结论：</span>
        用户口碑、博主测评、驱动长期稳定性和实时价格仍待 Agent 深度分析 / 后续爬虫补齐。
        {scores.price_note ? <span className="block">{scores.price_note}</span> : null}
      </div>

      {/* 基础快评分：弱化大分值，不作为最终购买建议 */}
      <div className="grid grid-cols-2 gap-3">
        {pairs.map(([side, s]) => {
          const theme = SIDE_THEME[side];
          return (
            <div
              key={side}
              className={`rounded-xl border ${theme.chipBorder} bg-slate-900/45 p-4`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className={`truncate text-[11px] font-bold ${theme.text}`}>
                  {side.toUpperCase()} · {s.model}
                </p>
                <StatusBadge label="快评" tone="info" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">
                {fmtScore(s.overall_score.current_score)}
                <span className="ml-1 text-xs font-medium text-slate-500">/ 100</span>
              </p>
              <p className="text-[11px] text-slate-400">本地硬件快评分，不是最终综合分</p>
              <p className="mt-2 text-[11px] leading-4 text-slate-500">
                保守占位分：{fmtScore(s.overall_score.full_score_with_missing_as_zero)}
                {" · "}
                数据完整度 {Math.round((s.data_completeness ?? 0) * 100)}%
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/35">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-[0.16em] text-slate-500">
              <th className="px-4 py-3 text-left font-medium">硬件参数</th>
              <th className="px-4 py-3 text-left font-medium text-cyan-300">A · {a.model}</th>
              <th className="px-4 py-3 text-left font-medium text-violet-300">B · {b.model}</th>
            </tr>
          </thead>
          <tbody>
            {specRows.map(([label, left, right]) => (
              <tr className="border-b border-slate-800/70 last:border-0" key={label}>
                <td className="px-4 py-2.5 text-slate-500">{label}</td>
                <td className="px-4 py-2.5 text-slate-200">{left}</td>
                <td className="px-4 py-2.5 text-slate-200">{right}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分项快评（含专业维度） */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ScoreMetric label="硬件快评" a={a.hardware_score} b={b.hardware_score} />
        <ScoreMetric label="驱动支持基础事实" a={a.software_score} b={b.software_score} />
        <ScoreMetric
          label={`点击系统（${a.click_system?.type ?? "—"} / ${b.click_system?.type ?? "—"}）`}
          a={a.click_system_score ?? null}
          b={b.click_system_score ?? null}
        />
      </div>

      {/* 模具置信度 + 点击系统优劣 */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {pairs.map(([side, s]) => {
          const theme = SIDE_THEME[side];
          const conf = Math.round((s.shape_confidence ?? 0) * 100);
          return (
            <div key={side} className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-bold ${theme.text}`}>{side.toUpperCase()} · 模具置信度</span>
                <StatusBadge
                  label={`${conf}%`}
                  tone={conf >= 100 ? "success" : conf >= 75 ? "info" : "warning"}
                />
              </div>
              {s.click_system?.pros ? (
                <p className="mt-1 text-[11px] leading-4 text-slate-400">点击系统：{s.click_system.pros}</p>
              ) : null}
              {s.click_system?.risk ? (
                <p className="mt-0.5 text-[11px] leading-4 text-amber-200/70">风险：{s.click_system.risk}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 产品识别与变体（避免把简称/模具混在一起） */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {pairs.map(([side, s]) => {
          const theme = SIDE_THEME[side];
          const id = (s.identity ?? {}) as Record<string, unknown>;
          const str = (k: string) => (typeof id[k] === "string" ? (id[k] as string) : "");
          const dataStatus = str("data_status");
          const confidenceSummary = id.field_confidence_summary;
          return (
            <div key={side} className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={`text-xs font-bold ${theme.text}`}>{side.toUpperCase()} · 产品识别</span>
                {dataStatus ? (
                  <StatusBadge
                    label={`数据 ${dataStatus}`}
                    tone={dataStatus === "verified" ? "success" : "warning"}
                  />
                ) : null}
              </div>
              <dl className="space-y-0.5 text-[11px] leading-4 text-slate-400">
                <div>系列 / 变体：<span className="text-slate-200">{str("family") || "—"} · {str("variant_name") || "Standard"}</span></div>
                <div>模具：<span className="font-mono text-slate-300">{str("mold_id") || "未标注"}</span>（{str("shape_detail") || "—"}）</div>
                <div>命名可信度：官方 {str("official_name_confidence") || "—"} · 简称 {str("alias_confidence") || "—"}</div>
                <div>字段来源：<span className="text-slate-200">{fieldConfidenceSummaryLine(confidenceSummary) || "—"}</span></div>
                <div>规则推断：<span className="text-slate-300">{fieldConfidenceFields(confidenceSummary, "rule_inferred") || "—"}</span></div>
                <div>社区字段：<span className="text-slate-300">{fieldConfidenceFields(confidenceSummary, "community_unverified") || fieldConfidenceFields(confidenceSummary, "community_likely") || "—"}</span></div>
              </dl>
            </div>
          );
        })}
      </div>

      {/* 体验/口碑待采集 */}
      <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-amber-100">握法 / 手型 / 游戏适配 / 网友评价</span>
          <StatusBadge label="待采集 · 爬虫未接入" tone="warning" />
        </div>
        <p className="mt-1 text-xs leading-5 text-amber-100/80">
          这些维度需要真实用户评价、博主测评和长期使用反馈，未计入「基础硬件快评」（在保守占位分里按 0 计入）；相关结论标记为待验证，不代表产品本身差。
        </p>
      </div>

      {/* 快评结论 */}
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="mb-2 text-sm font-semibold text-white">快评速览</p>
        <ul className="grid gap-1.5 text-sm text-slate-300 sm:grid-cols-2">
          <li>本地快评领先：<span className="font-medium text-cyan-200">{v.strongest_overall ?? "—"}</span></li>
          <li>硬件更强：<span className="font-medium text-cyan-200">{v.strongest_hardware ?? "—"}</span></li>
          <li>驱动支持基础判断：<span className="font-medium text-cyan-200">{v.best_software ?? "—"}</span></li>
          {v.best_click_system ? <li>点击系统更优：<span className="font-medium text-cyan-200">{v.best_click_system}</span></li> : null}
          <li>握法 / 手型 / 游戏适配：<span className="font-medium text-amber-200">待爬虫验证</span></li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 主页面
// ---------------------------------------------------------------------------
export function ProductComparePage({
  displayTaskId,
  onNavigate,
  onTaskCreated,
}: ProductComparePageProps) {
  const category = DEFAULT_PRODUCT_CATEGORY;
  const [selectedA, setSelectedA] = useState<ProductSearchResult | null>(null);
  const [selectedB, setSelectedB] = useState<ProductSearchResult | null>(null);
  const [result, setResult] = useState<ProductCompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStartingAnalysis, setIsStartingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // 两侧都选好后自动对比
  useEffect(() => {
    if (!selectedA || !selectedB) {
      setResult(null);
      setAnalysisError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAnalysisError(null);
    productApi
      .compareProducts(category, selectedA.id, selectedB.id)
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch(() => {
        if (!cancelled) setError("对比失败，请确认后端服务已启动。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedA, selectedB, category]);

  // 把 spec_differences 按字段索引，便于挑选展示
  const diffByField = useMemo(() => {
    const map: Record<string, SpecDifference> = {};
    (result?.spec_differences ?? []).forEach((diff) => {
      map[diff.field] = diff;
    });
    return map;
  }, [result]);

  const weight = diffByField.weight_g;
  const weightWinner: Side | null =
    weight?.advantage === "a" ? "a" : weight?.advantage === "b" ? "b" : null;

  const dimensionFields = ["length", "width", "height"] as const;
  const paramFields = ["dpi_max", "polling_rate_hz", "battery_hours"] as const;

  function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? (value as string[]) : [];
  }

  async function handleStartAgentAnalysis() {
    if (!result || isStartingAnalysis) {
      return;
    }

    setIsStartingAnalysis(true);
    setAnalysisError(null);

    try {
      const response = await analysisApi.startAnalysis(
        buildAnalysisPayload(result.product_a, result.product_b),
      );

      if (!response?.task_id) {
        throw new Error("系统未返回任务编号");
      }

      onTaskCreated?.(response.task_id);
      onNavigate?.("workflow");
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "启动分析失败");
    } finally {
      setIsStartingAnalysis(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-cyan-300">产品对比</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">电竞鼠标参数对比</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          选择两款电竞鼠标，基于本地结构化规格事实底座逐项对比重量、尺寸、传感器、回报率、续航与连接方式，并标注每项的优势方与数据来源。
        </p>
      </div>

      {/* 顶部：两个搜索框 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ProductPicker
          side="a"
          label="产品 A"
          category={category}
          selected={selectedA}
          onSelect={setSelectedA}
          onClear={() => setSelectedA(null)}
        />
        <ProductPicker
          side="b"
          label="产品 B"
          category={category}
          selected={selectedB}
          onSelect={setSelectedB}
          onClear={() => setSelectedB(null)}
        />
      </div>

      {/* 状态 */}
      {loading ? (
        <div className="mt-6">
          <LoadingState label="正在对比两款产品..." />
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!loading && !error && (!selectedA || !selectedB) ? (
        <div className="mt-6">
          <EmptyState
            title="请选择两款产品"
            description="在上方分别搜索并选定产品 A 与产品 B，选好后将自动生成对比。试试 GPX2 与 Viper V3 Pro。"
          />
        </div>
      ) : null}

      {/* 对比结果 */}
      {!loading && !error && result ? (
        <div className="mt-6 space-y-6 page-enter">
          {/* 产品头部 + VS */}
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <ProductHeader side="a" product={result.product_a} />
            <div className="self-center text-sm font-bold tracking-widest text-slate-500">
              VS
            </div>
            <ProductHeader side="b" product={result.product_b} />
          </div>

          {/* 基础硬件快评（即时判断，不是 Agent 最终建议） */}
          {result.product_scores ? (
            <ProductScoreboardSection scores={result.product_scores} />
          ) : null}

          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-cyan-200">
                  基础硬件快评已完成
                </p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  上方结果来自本地结构化产品库，所以会立刻出现；它只用于快速了解硬件参数、模具和点击系统差异。点击启动 Agent
                  深度分析后，系统会进入工作流页，由各 Agent 将基础快评转成最终购买建议。
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  这两款产品的硬件规格会作为结构化产品事实/证据注入工作流，由 Product、Verification、Quality
                  等 Agent 使用；握法、手型、适合游戏类型、用户口碑、博主测评、实时价格和长期可靠性暂无实时爬虫，会在最终报告里标记为待补齐。
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                <button
                  className="rounded-lg bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.2)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
                  disabled={isStartingAnalysis}
                  onClick={handleStartAgentAnalysis}
                  type="button"
                >
                  {isStartingAnalysis ? "启动中..." : "启动 Agent 深度分析"}
                </button>
                {displayTaskId ? (
                  <button
                    className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-cyan-300 hover:text-cyan-100"
                    onClick={() => onNavigate?.("workflow")}
                    type="button"
                  >
                    查看当前任务 {displayTaskId}
                  </button>
                ) : null}
              </div>
            </div>
            {analysisError ? (
              <div className="mt-4 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {analysisError}
              </div>
            ) : null}
          </div>

          {/* 重量差异条（重点指标） */}
          {weight ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">重量对比</h3>
                {weightWinner && typeof weight.abs_diff === "number" && weight.abs_diff > 0 ? (
                  <span className={`text-sm font-medium ${SIDE_THEME[weightWinner].text}`}>
                    {weightWinner.toUpperCase()} 轻 {weight.abs_diff} g
                  </span>
                ) : (
                  <span className="text-sm text-slate-500">重量相同</span>
                )}
              </div>
              <HeadToHeadBar
                valueA={typeof weight.a === "number" ? weight.a : null}
                valueB={typeof weight.b === "number" ? weight.b : null}
                unit=" g"
                winner={weightWinner}
                winnerVerb="更轻"
              />
            </div>
          ) : null}

          {/* 尺寸长宽高 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <h3 className="mb-4 text-base font-semibold text-white">外形尺寸（mm）</h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {dimensionFields.map((field) => {
                const diff = diffByField[field];
                if (!diff) return null;
                return (
                  <div key={field}>
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                      {diff.label}
                    </p>
                    <HeadToHeadBar
                      valueA={typeof diff.a === "number" ? diff.a : null}
                      valueB={typeof diff.b === "number" ? diff.b : null}
                      unit=""
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              尺寸大小无绝对优劣，取决于手型与握持习惯，这里只呈现差异。
            </p>
          </div>

          {/* DPI / 回报率 / 续航参数卡 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {paramFields.map((field) => {
              const diff = diffByField[field];
              if (!diff) return null;
              return <ParamCard key={field} diff={diff} />;
            })}
          </div>

          {/* 连接 / 形状 / 软件 / 板载内存 标签 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <h3 className="mb-4 text-base font-semibold text-white">规格与生态</h3>
            <div className="space-y-3">
              {/* 连接方式 */}
              {diffByField.connection ? (
                <AttributeRow
                  label="连接方式"
                  equal={diffByField.connection.equal ?? null}
                  note="有差异"
                  aNode={
                    <span className="flex flex-wrap gap-1.5">
                      {asStringArray(diffByField.connection.a).map((value) => (
                        <span
                          key={value}
                          className="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-0.5 text-xs text-slate-200"
                        >
                          {connectionLabel(value)}
                        </span>
                      ))}
                    </span>
                  }
                  bNode={
                    <span className="flex flex-wrap gap-1.5">
                      {asStringArray(diffByField.connection.b).map((value) => (
                        <span
                          key={value}
                          className="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-0.5 text-xs text-slate-200"
                        >
                          {connectionLabel(value)}
                        </span>
                      ))}
                    </span>
                  }
                />
              ) : null}

              {/* 形状 */}
              {diffByField.shape ? (
                <AttributeRow
                  label="形状"
                  equal={diffByField.shape.equal ?? null}
                  note="不同造型"
                  aNode={shapeLabel(diffByField.shape.a as string)}
                  bNode={shapeLabel(diffByField.shape.b as string)}
                />
              ) : null}

              {/* 软件 */}
              {diffByField.software ? (
                <AttributeRow
                  label="驱动软件"
                  equal={diffByField.software.equal ?? null}
                  note="不同生态"
                  aNode={fmt(diffByField.software.a)}
                  bNode={fmt(diffByField.software.b)}
                />
              ) : null}

              {/* 板载内存 */}
              {diffByField.onboard_memory ? (
                <AttributeRow
                  label="板载内存"
                  equal={diffByField.onboard_memory.equal ?? null}
                  note="支持情况不同"
                  aNode={
                    diffByField.onboard_memory.a === true
                      ? "支持"
                      : diffByField.onboard_memory.a === false
                        ? "不支持"
                        : "—"
                  }
                  bNode={
                    diffByField.onboard_memory.b === true
                      ? "支持"
                      : diffByField.onboard_memory.b === false
                        ? "不支持"
                        : "—"
                  }
                />
              ) : null}
            </div>
          </div>

          {/* 缺失字段提示 */}
          {result.missing_fields.product_a.length > 0 ||
          result.missing_fields.product_b.length > 0 ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-xs text-amber-100">
              部分字段数据不全（如有线鼠标无续航）：
              {result.missing_fields.product_a.length > 0
                ? ` A 缺 ${result.missing_fields.product_a.join("、")}；`
                : ""}
              {result.missing_fields.product_b.length > 0
                ? ` B 缺 ${result.missing_fields.product_b.join("、")}`
                : ""}
            </div>
          ) : null}

          {/* 来源摘要 */}
          <div>
            <h3 className="mb-4 text-base font-semibold text-white">数据来源</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SourceCard
                side="a"
                product={result.product_a}
                summary={result.source_summary.product_a}
              />
              <SourceCard
                side="b"
                product={result.product_b}
                summary={result.source_summary.product_b}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
