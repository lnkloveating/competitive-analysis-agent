# Agent Protocol

本协议定义多 Agent 竞品分析系统中每个 Agent 的职责边界、输入输出和打回规则。核心原则：上游负责事实和证据，中游负责结构化分析，下游负责质检和报告；任何 Agent 都不应越权生成不属于自身职责的结论。

## 职责边界

| Agent | 只负责什么 | 不负责什么 | 输入 | 输出 | 失败条件 | 可被打回 |
|---|---|---|---|---|---|---|
| ResearchAgent | 采集公开材料，按行业、平台和关注维度生成原始研究记录 | 不做结论分析，不给战略建议，不判断证据可信度 | `target_platform`、`competitors`、`industry_key`、`industry_name`、`focus_dimensions`、`analysis_scene`、`time_range` | `raw_research` | 没有为目标平台和竞品生成可追溯材料；材料缺少平台、维度、来源或发布时间；采集内容明显偏离行业配置 | 是 |
| EvidenceAgent | 从原始材料抽取 claim、来源信息和证据可信度，生成可追溯证据 | 不做产品矩阵，不做商业判断，不生成战略建议 | `raw_research`、`focus_dimensions` | `evidence_list` | 证据缺少 `evidence_id`、`claim`、`credibility` 或 `related_dimension`；可信度分类异常；证据无法追溯到原始材料 | 是 |
| ProductAgent | 做产品、功能、参数、体验等维度对比，输出产品矩阵 | 不判断商业模式，不做最终战略建议，不新增未经证据支持的事实 | `evidence_list`、`target_platform`、`competitors`、`focus_dimensions` | `product_matrix` | 矩阵缺平台或维度；评分缺少说明；结论没有引用有效 `evidence_id`；把商业策略当作产品能力判断 | 是 |
| BusinessAgent | 分析定价、渠道、市场、品牌策略和商业表现，输出商业矩阵 | 不分析硬件参数细节，不做最终战略建议，不新增未经证据支持的事实 | `evidence_list`、`target_platform`、`competitors`、`focus_dimensions`、`target_user` | `business_matrix` | 矩阵缺平台或维度；评分缺少说明；结论没有引用有效 `evidence_id`；把硬件参数当作商业策略判断 | 是 |
| RiskAgent | 识别证据缺口、数据时效、可信度和合规风险 | 不决定是否通过，不打回 Agent，不生成最终报告 | `product_matrix`、`business_matrix`、`evidence_list` | `risk_flags` | 风险类型、严重性或影响范围缺失；没有识别明显证据缺口；风险缺少处理建议 | 否 |
| QualityAgent | 判断分析是否可进入最终报告，并决定是否打回 Research、Evidence、Product 或 Business | 不生成最终报告，不新增业务结论，不直接修改矩阵 | `raw_research`、`evidence_list`、`product_matrix`、`business_matrix`、`risk_flags` | `quality_result` | 未检查证据支撑、矩阵完整性、高可信证据和高严重性风险；打回目标不明确；缺少 `required_fix` | 否 |
| StrategyAgent | 汇总产品矩阵、商业矩阵、风险和质检结果，生成管理层报告 | 不新增未经证据支持的事实，不重新采集材料，不绕过质检，不编造 `evidence_id` | `product_matrix`、`business_matrix`、`evidence_list`、`risk_flags`、`quality_result` | `final_report` | 报告结论没有证据引用；战略建议缺少 `evidence_id`；排名或 SWOT 与矩阵和证据冲突；引用不存在的证据编号 | 否 |

## StrategyAgent 证据约束

StrategyAgent 不能凭空生成新结论。它的每个关键结论都必须能够追溯到 `evidence_list` 中的 `evidence_id`。

| 报告区域 | 证据要求 |
|---|---|
| `competitive_ranking[].summary` | 每个平台 summary 必须引用至少 1 个 `evidence_id` |
| `swot_analysis.strengths` | 每条优势尽量引用至少 1 个 `evidence_id` |
| `swot_analysis.weaknesses` | 每条劣势尽量引用至少 1 个 `evidence_id` |
| `strategic_recommendations` | 每条建议必须引用至少 1 个 `evidence_id`，格式为：`建议内容（证据：EV001、EV003）` |
| `data_confidence` | 必须说明证据数量、质检状态和数据限制 |

如果输入证据不足，StrategyAgent 应降低结论强度，并在 `data_confidence` 和建议中明确说明限制，而不是补造事实。
