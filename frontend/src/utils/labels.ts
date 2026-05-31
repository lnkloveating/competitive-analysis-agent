// 用户可见文案的集中映射。内部数据值保持不变，仅在 UI 层做中文化与解释。

export const sourceTypeLabels: Record<string, string> = {
  official: "官方资料",
  review: "评测内容",
  ecommerce: "电商信息",
  social: "用户口碑",
  other: "其他来源",
};

export function getSourceTypeLabel(value?: string): string {
  if (!value) {
    return "其他来源";
  }

  return sourceTypeLabels[value.toLowerCase()] ?? value;
}

export const sourceTypeExplains: Record<string, string> = {
  official: "来自品牌官网、官方规格或官方发布的资料。",
  review: "来自专业媒体或第三方评测的内容。",
  ecommerce: "来自电商平台的商品信息与销售数据。",
  social: "来自社区、论坛与社交平台的用户口碑。",
  other: "未明确归类的公开信息来源。",
};

export function getSourceTypeExplain(value?: string): string {
  if (!value) {
    return sourceTypeExplains.other;
  }

  return sourceTypeExplains[value.toLowerCase()] ?? "公开信息来源。";
}

export const credibilityLabels: Record<string, string> = {
  high: "高可信",
  medium: "中可信",
  low: "低可信",
};

export function getCredibilityLabel(value?: string): string {
  if (!value) {
    return "未知";
  }

  return credibilityLabels[value.toLowerCase()] ?? value;
}

export const credibilityExplains: Record<string, string> = {
  high: "高可信证据，适合作为核心结论依据。",
  medium: "中可信证据，需要结合其他证据判断。",
  low: "低可信证据，仅供参考。",
};

export function getCredibilityExplain(value?: string): string {
  if (!value) {
    return "可信度未标注的证据。";
  }

  return credibilityExplains[value.toLowerCase()] ?? "可信度未标注的证据。";
}

// 质量审查覆盖缺口字段的中文前缀。
export const coverageFieldLabels: Record<string, string> = {
  missing_dimensions: "缺失维度",
  missing_platforms: "缺失品牌",
  missing_evidence: "缺失证据",
  coverage_gaps: "覆盖缺口",
  high_risk_flags: "高风险标记",
  risk_flags: "风险标记",
};

export function getCoverageFieldLabel(field: string): string {
  return coverageFieldLabels[field] ?? field;
}

export type AgentMeta = {
  /** Agent 的中文作用说明。 */
  role: string;
};

// 各 Agent 的作用说明，用于节点悬停与详情展示。
export const agentMeta: Record<string, AgentMeta> = {
  ResearchAgent: { role: "收集公开调研资料" },
  EvidenceAgent: { role: "从调研资料中抽取结构化证据" },
  ProductAgent: { role: "生成产品分析矩阵与产品结论" },
  BusinessAgent: { role: "生成商业分析矩阵与商业结论" },
  RiskAgent: { role: "识别风险项" },
  QualityAgent: { role: "质量门控审查" },
  StrategyAgent: { role: "生成最终竞品策略报告" },
  HumanReviewRequired: { role: "质量门控未通过时进入人工复核" },
};

export function getAgentRole(agentName: string): string {
  return agentMeta[agentName]?.role ?? "参与多 Agent 协作流程";
}
