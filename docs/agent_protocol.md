# Agent Protocol

## 1. Overview

本系统是一个多 Agent 协作的竞品分析后端，使用 LangGraph 编排 7 个 Agent，模拟一个结构化数字调研小组。

当前主流程：

```text
ResearchAgent
  -> EvidenceAgent
  -> ProductAgent / BusinessAgent
  -> RiskAgent
  -> QualityAgent
  -> StrategyAgent
```

其中 `ProductAgent` 和 `BusinessAgent` 可以并行执行，最终通过 state reducer 合并 `claims` 和 `trace_log`。

核心约束：

- Agent 之间不是自由聊天，而是通过结构化 `state` 传递信息。
- 每个 Agent 有明确职责边界，只读写自己负责的字段。
- 每个核心输出都经过 Pydantic Schema 校验。
- 最终报告必须引用已有 `claims` 和 `evidence_ids`。
- `QualityAgent` 可以结构化定向打回，例如打回 `EvidenceAgent`、`ProductAgent` 或 `BusinessAgent`。
- 三次自动修复失败后进入 `HumanReviewRequired`，不会 force pass。

当前系统不是普通 LLM 报告生成器，而是 evidence-grounded、schema-validated、quality-controlled 的多 Agent 竞品分析工作流。

## 2. Agent Workflow

正常路径：

```text
ResearchAgent
  -> EvidenceAgent
  -> ProductAgent
  -> BusinessAgent
  -> RiskAgent
  -> QualityAgent
       | approved
       v
     StrategyAgent
       |
       v
     final_report
```

质量打回路径：

```text
QualityAgent
  -> reject_to target Agent
  -> rerun downstream workflow
```

三次失败后的人工审核路径：

```text
QualityAgent
  -> HumanReviewRequired
  -> human-review draft final_report
```

`QualityAgent` 输出 `reject_to`，可选目标包括：

- `ResearchAgent`
- `EvidenceAgent`
- `ProductAgent`
- `BusinessAgent`
- `RiskAgent`
- `StrategyAgent`

如果 `iteration_count >= 3` 后仍然 rejected，系统进入 human review mode，并设置：

```text
needs_human_review = True
quality_status = "rejected_after_max_iterations"
is_approved = False
```

## 3. State Contract

workflow state 是 Agent 间唯一可信的数据交换协议。核心字段如下：

| Field | Type | Description |
|---|---|---|
| `raw_research` | `list[dict]` | `ResearchAgent` 采集或 mock 的原始调研材料 |
| `evidence_list` | `list[dict]` | `EvidenceAgent` 生成的结构化证据 |
| `product_matrix` | `dict` | `ProductAgent` 生成的产品维度矩阵 |
| `business_matrix` | `dict` | `BusinessAgent` 生成的商业维度矩阵 |
| `claims` | `list[dict]` | `ProductAgent` / `BusinessAgent` 生成的结构化结论 |
| `risk_flags` | `list[dict]` | `RiskAgent` 生成的风险标记 |
| `quality_result` | `dict` | `QualityAgent` 生成的质检结果 |
| `final_report` | `dict` | `StrategyAgent` 或 `HumanReviewRequired` 生成的报告 |
| `trace_log` | `list[dict]` | Agent 执行轨迹 |
| `metrics` | `dict` | 报告质量指标，当前可能为空对象 |
| `used_claim_ids` | `list[str]` | `final_report` 使用过的 `claim_id` |
| `used_evidence_ids` | `list[str]` | `final_report` 使用过的 `evidence_id` |
| `current_agent` | `str` | 当前 Agent 或最近完成的 Agent |
| `iteration_count` | `int` | `QualityAgent` 自动打回次数 |
| `rejected_agents` | `list[str]` | 被打回过的 Agent |
| `is_approved` | `bool` | 当前 workflow 是否通过质量检查 |
| `needs_human_review` | `bool` | 是否需要人工审核 |
| `quality_status` | `str` | `approved` / `rejected_after_max_iterations` 等状态 |

并行分支说明：

- `ProductAgent` 和 `BusinessAgent` 都会追加 `claims`。
- `ProductAgent` 和 `BusinessAgent` 都会追加 `trace_log`。
- workflow state 已通过 reducer 合并这两个字段，避免并行分支覆盖彼此输出。

## 4. Agent Compatibility Layer

当前目录结构：

```text
backend/agents/
  research_agent.py      # compatibility wrapper
  evidence_agent.py      # compatibility wrapper
  product_agent.py       # compatibility wrapper
  business_agent.py      # compatibility wrapper
  risk_agent.py          # compatibility wrapper
  quality_agent.py       # compatibility wrapper
  strategy_agent.py      # compatibility wrapper

backend/app/agents/
  research_agent.py      # real implementation
  evidence_agent.py      # real implementation
  product_agent.py       # real implementation
  business_agent.py      # real implementation
  risk_agent.py          # real implementation
  quality_agent.py       # real implementation
  strategy_agent.py      # real implementation
```

`backend/agents` 保留是为了兼容旧 workflow 的 import 路径。新业务逻辑都在 `backend/app/agents`。

当前不删除 wrapper，是为了保证：

- 旧 workflow 稳定运行；
- 旧测试无需大规模改动；
- 后续迁移可以逐步推进。

如果未来 workflow 直接改为 import `app.agents`，可以再考虑删除 wrapper。

## Gaming Mouse Demo Scenario

当前 Demo 第一阶段聚焦 `gaming_mouse` 电竞鼠标垂直场景，而不是泛电竞外设。

选择电竞鼠标的原因：

- 鼠标参数明确，适合结构化对比，例如传感器、DPI、回报率、重量、无线续航。
- 公开数据充足，适合 evidence-grounded 分析。
- 用户评论和评测内容丰富，适合展示 Evidence -> Claim -> Report 溯源链路。
- 后端仍然通过 `industry_config` 支持多行业扩展，`gaming_peripherals` 没有删除。

当前 `gaming_mouse` 覆盖品牌：

- 罗技
- 雷蛇
- 海盗船

代表型号：

| 品牌 | 代表型号 |
|---|---|
| 罗技 | `G Pro X Superlight 2`、`G502 X Plus` |
| 雷蛇 | `Viper V3 Pro`、`DeathAdder V3 Pro` |
| 海盗船 | `M75 Air`、`SABRE RGB PRO Wireless` |

核心维度：

- 性能参数
- 轻量化设计
- 无线与续航
- 软件生态
- 用户口碑
- 价格定位
- 电竞品牌影响力

Mock 数据来源类型覆盖：

- `official`
- `review`
- `ecommerce`
- `user_review`
- `news`
- `report`

Mock URL 使用 `mock://gaming_mouse/...` 风格，并包含 `dimension`、`related_dimension`、`product_name`、`category` 兼容字段，方便后续 Agent 识别行业、产品和维度。

## 5. Agent Protocol Details

### 5.1 ResearchAgent

**Implementation:** `backend/app/agents/research_agent.py`  
**Compatibility wrapper:** `backend/agents/research_agent.py`

#### Responsibility

负责采集竞品公开信息。当前通过 `MockResearchProvider` 生成 LLM mock 或 deterministic mock 数据。未来接真实爬虫时，可以扩展为 `CrawlerResearchProvider`。

当 `industry_key = "gaming_mouse"` 时，`MockResearchProvider` 会生成电竞鼠标 mock 数据，覆盖：

- 罗技 `G Pro X Superlight 2`、`G502 X Plus`
- 雷蛇 `Viper V3 Pro`、`DeathAdder V3 Pro`
- 海盗船 `M75 Air`、`SABRE RGB PRO Wireless`

并覆盖 source type：

- `official`
- `review`
- `ecommerce`
- `user_review`
- `news`
- `report`

#### Inputs

- `target_platform`
- `competitors`
- `analysis_scene`
- `target_user`
- `time_range`
- `focus_dimensions`
- `industry_key`
- `industry_name`

#### Outputs

- `state["raw_research"]`
- `state["current_agent"] = "ResearchAgent"`
- `trace_log` 追加 `ResearchAgent` 执行记录

#### Schema

`RawResearchItem`

字段包括：

- `item_id`
- `platform`
- `source_type`
- `source_title`
- `source_url`
- `publish_time`
- `collected_time`
- `raw_content`
- `crawl_method`

#### Forbidden Behaviors

- 不生成 `evidence_list`
- 不生成 `claims`
- 不生成 `product_matrix`
- 不生成 `business_matrix`
- 不生成 `final_report`

#### Notes

- 当前 mock URL 使用 `mock://...`。
- `crawl_method = "llm_mock"`。
- 真实爬虫只需要实现 `ResearchProvider.collect(state)` 接口。

### 5.2 EvidenceAgent

**Implementation:** `backend/app/agents/evidence_agent.py`  
**Compatibility wrapper:** `backend/agents/evidence_agent.py`

#### Responsibility

将 `raw_research` 转换为结构化证据。

在 `gaming_mouse` 场景下，重点识别这些维度：

- 性能参数
- 轻量化设计
- 无线与续航
- 软件生态
- 用户口碑
- 价格定位
- 电竞品牌影响力

#### Inputs

- `state["raw_research"]`
- `state["competitors"]`
- `state["focus_dimensions"]`

#### Outputs

- `state["evidence_list"]`
- `state["current_agent"] = "EvidenceAgent"`
- `trace_log` 追加 `EvidenceAgent` 执行记录

#### Schema

`EvidenceItem`

字段包括：

- `evidence_id`
- `platform`
- `claim`
- `source_type`
- `source_title`
- `source_url`
- `publish_time`
- `collected_time`
- `credibility`
- `related_dimension`
- `raw_content`
- `confidence_score`

兼容字段：

- `dimension`
- `content`
- `summary`
- `source`
- `used_by_agent`

#### Forbidden Behaviors

- 不生成 `final_report`
- 不生成 `product_matrix`
- 不生成 `business_matrix`
- 不新增与 `raw_research` 无关的证据

#### Notes

- `evidence_id` 使用稳定序号：`EV001`、`EV002`、`EV003`。
- 每条 evidence 都需要能通过 `EvidenceItem` schema 校验。

### 5.3 ProductAgent

**Implementation:** `backend/app/agents/product_agent.py`  
**Compatibility wrapper:** `backend/agents/product_agent.py`

#### Responsibility

基于 `evidence_list` 生成产品维度分析，输出 `product_matrix`，并生成 `PCL` 开头的 product claims。

在 `gaming_mouse` 场景下，`ProductAgent` 重点关注：

- 传感器 / DPI / 回报率 / 延迟
- 重量 / 轻量化
- 外形 / 手感 / 人体工学
- 无线连接 / 续航
- 驱动软件 / 配置能力
- 用户体验和常见问题

#### Inputs

- `state["evidence_list"]`
- `state["competitors"]`
- `state["focus_dimensions"]`

#### Outputs

- `state["product_matrix"]`
- append `state["claims"]`
- `state["current_agent"] = "ProductAgent"`
- `trace_log` 追加 `ProductAgent` 执行记录

#### Schema

- `ProductAgentOutput`
- `Claim`

`product_matrix` 兼容结构：

```text
dimensions -> dimension -> platform -> score / summary / evidence_ids
```

新增字段：

- `analysis`
- `confidence_score`

Claim 示例：

```json
{
  "claim_id": "PCL001",
  "content": "罗技在性能参数维度有较多证据支持。",
  "dimension": "性能参数",
  "related_platforms": ["罗技"],
  "evidence_ids": ["EV001"],
  "confidence_score": 0.8,
  "generated_by": "ProductAgent"
}
```

#### Forbidden Behaviors

- 不生成新的 evidence
- 不生成 `BusinessAgent` 的商业结论
- 不生成 `final_report`
- 不创建没有 `evidence_ids` 的 claim
- 不引用不存在的 `evidence_id`

#### Notes

`claim_id` 使用 `PCL001`、`PCL002` 等稳定序号。

### 5.4 BusinessAgent

**Implementation:** `backend/app/agents/business_agent.py`  
**Compatibility wrapper:** `backend/agents/business_agent.py`

#### Responsibility

基于 `evidence_list` 生成商业维度分析，输出 `business_matrix`，并生成 `BCL` 开头的 business claims。

在 `gaming_mouse` 场景下，`BusinessAgent` 重点关注：

- 价格定位
- 电竞品牌影响力
- 产品线策略
- 目标用户定位
- 渠道和销售策略

#### Inputs

- `state["evidence_list"]`
- `state["competitors"]`
- `state["focus_dimensions"]`

#### Outputs

- `state["business_matrix"]`
- append `state["claims"]`
- `state["current_agent"] = "BusinessAgent"`
- `trace_log` 追加 `BusinessAgent` 执行记录

#### Schema

- `BusinessAgentOutput`
- `Claim`

`business_matrix` 兼容结构：

```text
dimensions -> dimension -> platform -> score / summary / evidence_ids
```

新增字段：

- `analysis`
- `confidence_score`

Claim 示例：

```json
{
  "claim_id": "BCL001",
  "content": "雷蛇在价格定位上更偏向高端电竞用户。",
  "dimension": "价格定位",
  "related_platforms": ["雷蛇"],
  "evidence_ids": ["EV006"],
  "confidence_score": 0.76,
  "generated_by": "BusinessAgent"
}
```

#### Forbidden Behaviors

- 不生成新的 evidence
- 不生成 `ProductAgent` 的技术细节结论
- 不生成 `final_report`
- 不创建没有 `evidence_ids` 的 claim
- 不引用不存在的 `evidence_id`

#### Notes

- `claim_id` 使用 `BCL001`、`BCL002` 等稳定序号。
- `ProductAgent` 和 `BusinessAgent` 并行时，`claims` 会通过 reducer 合并。

### 5.5 RiskAgent

**Implementation:** `backend/app/agents/risk_agent.py`  
**Compatibility wrapper:** `backend/agents/risk_agent.py`

#### Responsibility

基于 evidence、claims、product matrix、business matrix 识别风险，输出结构化 `risk_flags`。

#### Inputs

- `state["evidence_list"]`
- `state["claims"]`
- `state["product_matrix"]`
- `state["business_matrix"]`
- `state["competitors"]`
- `state["focus_dimensions"]`

#### Outputs

- `state["risk_flags"]`
- `state["current_agent"] = "RiskAgent"`
- `trace_log` 追加 `RiskAgent` 执行记录

#### Schema

- `RiskAgentOutput`
- `RiskFlag`

`risk_type` 只允许：

- `data_credibility`
- `data_timeliness`
- `evidence_gap`
- `compliance`

兼容字段：

- `risk_id`
- `affected_platform`
- `affected_dimension`
- `suggestion`
- `related_evidence_ids`

#### Implemented Rules

- low credibility 占比过高
- claim 仅由 low evidence 支撑
- `publish_time` 缺失较多
- 证据超过 2 年 / 3 年
- 竞品缺证据
- 维度缺证据
- matrix cell 缺 `evidence_ids`
- `user_review` 中疑似包含用户名、`user_id`、`profile`、头像、主页、email、手机号等隐私信息

#### Forbidden Behaviors

- 不生成 evidence
- 不生成 claims
- 不修改 `product_matrix`
- 不修改 `business_matrix`
- 不决定是否 approved
- 不生成 `final_report`

#### Notes

`RiskAgent` 只负责识别风险。是否打回由 `QualityAgent` 决定。

### 5.6 QualityAgent

**Implementation:** `backend/app/agents/quality_agent.py`  
**Compatibility wrapper:** `backend/agents/quality_agent.py`

#### Responsibility

对 workflow 中间产物进行结构化质量检查，判断是否 approved。如果 rejected，输出 `reject_to`、`reject_reason`、`required_actions`。三次失败后进入 human review mode。

当前 `QualityAgent` 已检查 competitor / dimension / evidence_ids / matrix / high risk 等通用质量规则。

`gaming_mouse` 的代表型号覆盖检查暂未加入 `QualityAgent` 强规则。目前通过 `MockResearchProvider` 的 mock 数据和 `backend/test_gaming_mouse_config.py` 保证三个品牌、七个维度和代表型号覆盖。这一项可作为 future extension。

#### Inputs

- `state["evidence_list"]`
- `state["claims"]`
- `state["product_matrix"]`
- `state["business_matrix"]`
- `state["risk_flags"]`
- `state["competitors"]`
- `state["focus_dimensions"]`
- `state["iteration_count"]`

#### Outputs

- `state["quality_result"]`
- `state["is_approved"]`
- `state["rejected_agents"]`
- `state["iteration_count"]`
- `state["needs_human_review"]`
- `state["quality_status"]`
- `state["current_agent"] = "QualityAgent"`
- `trace_log` 追加 `QualityAgent` 执行记录

#### Schema

`QualityResult`

核心检查：

- claims 是否都有 `evidence_ids`
- claim 引用的 `evidence_ids` 是否真实存在
- 每个 competitor 是否有 evidence 覆盖
- 每个 `focus_dimension` 是否有 evidence 覆盖
- `product_matrix` 是否为空
- `business_matrix` 是否为空
- 是否存在 high severity risk

Rejected 输出包括：

- `reject_to`
- `reject_reason`
- `required_actions`
- `missing_dimensions`
- `missing_platforms`
- `checked_items`

兼容字段：

- `status`
- `quality_score`
- `reason`
- `target_agent`
- `required_fix`

#### Forbidden Behaviors

- 不生成 evidence
- 不生成 claims
- 不生成 `final_report`
- 不把 rejected 状态强制标记为 approved
- 不让 LLM 在证据不足时编造内容

#### Notes

Human review 触发条件：

```text
iteration_count >= 3 and still rejected
```

触发后设置：

```text
needs_human_review = True
quality_status = "rejected_after_max_iterations"
is_approved = False
```

### 5.7 StrategyAgent

**Implementation:** `backend/app/agents/strategy_agent.py`  
**Compatibility wrapper:** `backend/agents/strategy_agent.py`

#### Responsibility

在 `QualityAgent` approved 后生成正式 `final_report`。报告基于 claims、product matrix、business matrix、risk flags、quality result 生成，并保证报告中的 claim/evidence 引用真实存在。

#### Inputs

- `state["claims"]`
- `state["product_matrix"]`
- `state["business_matrix"]`
- `state["risk_flags"]`
- `state["quality_result"]`
- `state["evidence_list"]`
- `state["metrics"]`

#### Outputs

- `state["final_report"]`
- `state["used_claim_ids"]`
- `state["used_evidence_ids"]`
- `state["current_agent"] = "StrategyAgent"`
- `trace_log` 追加 `StrategyAgent` 执行记录

#### Schema

`StrategyAgentOutput`

`final_report` 旧字段兼容：

- `executive_summary`
- `competitive_ranking`
- `swot_analysis`

新增标准字段：

- `competitor_ranking`
- `swot`
- `strategic_recommendations`
- `risk_disclosure`
- `used_claim_ids`
- `used_evidence_ids`
- `quality_result`
- `metrics`

#### Rules

- `used_claim_ids` 必须全部来自 `state["claims"]`
- `used_evidence_ids` 必须全部来自 `state["evidence_list"]`
- `strategic_recommendations[].supporting_claim_ids` 必须真实存在
- `strategic_recommendations[].supporting_evidence_ids` 必须真实存在
- 不存在的 ID 会被过滤，不允许进入 `final_report`

#### Forbidden Behaviors

- 不生成新的 evidence
- 不生成新的 claims
- 不引用不存在的 `claim_id`
- 不引用不存在的 `evidence_id`
- 不在 rejected / `needs_human_review` 状态下生成正式报告
- 不隐藏 `risk_flags` 和 `quality_result`

#### Notes

如果 `needs_human_review = True` 或 `quality_result.approved = False`，`StrategyAgent` 只生成待人工审核草稿，不生成正式报告。

## 6. Claim and Evidence Traceability

Traceability 链路：

```text
RawResearchItem
  -> EvidenceItem
  -> Claim
  -> Strategy Recommendation
  -> Final Report
```

ID 规则：

| Type | ID Format |
|---|---|
| Evidence ID | `EV001`, `EV002`, `EV003` |
| Product Claim ID | `PCL001`, `PCL002` |
| Business Claim ID | `BCL001`, `BCL002` |

校验规则：

- `Claim.evidence_ids` 必须存在于 `evidence_list`
- `final_report.used_claim_ids` 必须存在于 `claims`
- `final_report.used_evidence_ids` 必须存在于 `evidence_list`
- `strategic_recommendations[].supporting_claim_ids` 必须存在于 `claims`
- `strategic_recommendations[].supporting_evidence_ids` 必须存在于 `evidence_list`

当前已有 `backend/test_traceability.py` 检查这些引用链，确保最终报告不引用不存在的 claim 或 evidence。

## 7. Quality Feedback Loop

`QualityAgent` 不是只返回 pass/fail，而是输出结构化质检结果：

```json
{
  "approved": false,
  "score": 70,
  "reject_to": "EvidenceAgent",
  "reject_reason": "部分分析维度缺少证据。",
  "missing_dimensions": ["价格定位"],
  "missing_platforms": [],
  "required_actions": ["补充价格定位相关 evidence"],
  "checked_items": {
    "all_claims_have_evidence": true,
    "all_evidence_ids_valid": true,
    "all_competitors_covered": true,
    "all_dimensions_covered": false
  }
}
```

`reject_to` 的路由含义：

| Problem | Typical reject_to |
|---|---|
| Evidence 缺失 | `EvidenceAgent` |
| Product matrix 问题 | `ProductAgent` |
| Business matrix 问题 | `BusinessAgent` |
| Risk 高风险 | `EvidenceAgent` / `RiskAgent` / `ResearchAgent` |

实际路由由 `quality_router` 根据 `quality_result` 和 `iteration_count` 决定。

## 8. Human Review Mode

如果 `QualityAgent` 自动打回 3 次后仍然失败，系统不会 force pass，也不会让 LLM 编造正式报告。

系统进入：

```text
HumanReviewRequired
```

状态字段：

```text
needs_human_review = True
quality_status = "rejected_after_max_iterations"
is_approved = False
```

此时 `final_report` 会变成待人工审核草稿，包含：

- `quality_result`
- `risk_flags`
- `missing_dimensions`
- `missing_platforms`
- `required_actions`
- `draft_product_matrix`
- `draft_business_matrix`
- `draft_claims`
- `disclaimer`

前端应将该状态展示为“待人工审核”，不要展示为正式 approved 报告。

## 9. Trace Log Protocol

`trace_log` 中每条记录大致包括：

```json
{
  "step_id": 1,
  "agent_name": "EvidenceAgent",
  "status": "success",
  "output_summary": "generated 21 evidence items",
  "duration_ms": 1234,
  "error": null
}
```

说明：

- `duration_ms` 是可选字段，不是每个当前 Agent 都一定写入。
- `error` 正常为 `null`。
- `status` 常见值包括 `success`、`rejected`、`failed`、`schema_failed`。

`trace_log` 覆盖：

- `ResearchAgent`
- `EvidenceAgent`
- `ProductAgent`
- `BusinessAgent`
- `RiskAgent`
- `QualityAgent`
- `StrategyAgent`
- `HumanReviewRequired`

用途：

- 前端 Workflow 页面
- Agent Replay
- Debug
- 答辩展示

## 10. Frontend-facing Readonly APIs

当前 FastAPI 已提供以下只读接口，供 Agent 工作台展示中间产物：

```text
GET /api/analysis/{task_id}/evidence
GET /api/analysis/{task_id}/claims
GET /api/analysis/{task_id}/trace
GET /api/analysis/{task_id}/quality
GET /api/analysis/{task_id}/metrics
GET /api/analysis/{task_id}/risks
GET /api/analysis/{task_id}/artifacts
```

接口约束：

- 不会触发 workflow。
- 只读取已有 task state。
- `task_id` 不存在返回 404。
- 字段缺失时返回空数组或空对象。
- 用于前端 Agent 工作台展示 evidence、claims、trace、quality、risks 和产物摘要。

完整 API 说明见 `docs/api.md`。

## 11. Design Principles

本系统遵循以下设计原则：

1. **Schema-first Agent communication**  
   Agent 之间通过结构化 state 和 Pydantic Schema 传递信息。

2. **Evidence-grounded claims**  
   Product / Business claims 必须绑定真实存在的 `evidence_ids`。

3. **No unsupported final report**  
   StrategyAgent 不允许生成没有 claim/evidence 支撑的正式结论。

4. **Quality rejection before strategy generation**  
   QualityAgent 先做结构化质检，只有 approved 才进入正式 StrategyAgent 报告。

5. **Human review instead of force pass**  
   三次自动修复失败后进入人工审核，不强制通过。

6. **Backward compatibility during migration**  
   `backend/agents` wrapper 保留旧 import 路径，真实实现迁移到 `backend/app/agents`。

7. **Traceable and frontend-readable intermediate artifacts**  
   中间产物通过只读 API 暴露，便于前端展示、调试和答辩说明。

8. **Industry-config driven extensibility**  
   当前 Demo 聚焦 `gaming_mouse`，但行业信息仍通过配置驱动，后续可以扩展到泛电竞外设、智能手机、耳机、摄影器材等场景。

当前系统不是普通 LLM 报告生成器，而是 evidence-grounded、schema-validated、quality-controlled 的多 Agent 竞品分析工作流。
