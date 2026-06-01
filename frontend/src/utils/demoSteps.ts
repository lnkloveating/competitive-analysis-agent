// 自动演示流程：任务创建后按顺序自动切换的页面与停留时长。
export type DemoStep = {
  key: string;
  label: string;
  /** 自动停留时长（毫秒）。 */
  delay: number;
};

export const demoSteps: DemoStep[] = [
  { key: "workflow", label: "Agent 工作流", delay: 7000 },
  { key: "evidence", label: "证据中心", delay: 4000 },
  { key: "claims", label: "结论追踪", delay: 4000 },
  { key: "quality", label: "质量审查", delay: 4000 },
  { key: "report", label: "最终报告", delay: 5000 },
  { key: "metrics", label: "指标看板", delay: 4000 },
];
