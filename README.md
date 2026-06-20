# AI 驱动的电竞鼠标竞品分析 Agent 系统

这是一个面向电竞鼠标竞品分析的多 Agent 协作项目。当前版本聚焦一个垂直场景：输入两款电竞鼠标，系统通过 LangGraph DAG 完成产品识别、硬件事实读取、证据结构化、事实校验、质量门控和专业报告生成。

## 当前架构

```text
ResearchAgent
  -> CollectorAgent
  -> EvidenceAgent
  -> AnalysisAgent
  -> VerificationAgent
  -> QualityAgent
       | approved / approved_with_limitations / partial_report
       v
     ReportAgent
```

QualityAgent 可以把问题结构化打回 Research / Collector / Evidence / Analysis。自动修复达到上限后不会伪装成功，也不会默认人工阻塞，而是生成 `partial_report` 并披露缺失数据。

## 专业 Schema

项目只保留最新的电竞鼠标专业报告 schema：

- `GamingMouseFinalReportSchema`
- `ProductIdentitySchema`
- `HardwareSpecSchema`
- `FeatureTreeSchema`
- `PricingModelSchema`
- `UserPersonaSchema`
- `EvidenceLinkSchema`
- `ScoreFlowSchema`
- `AgentContributionSchema`

稳定硬件事实来自 [data/products/gaming_mice.json](data/products/gaming_mice.json)。用户评价、博主测评、实时价格、长期可靠性和驱动口碑不写死在 JSON 中，当前标记为 `pending_data`，后续由 MCP 工具补齐。

## 数据策略

- 本地 JSON：只存相对稳定的硬件事实、官方型号、别名、模具、点击系统、字段可信度。
- MCP 工具层：下一步接入官网规格、评价测评、实时价格和搜索工具；未接入前返回空外部研究集。
- 不再使用模拟 provider、预载 evidence、旧演示 seed。
- 未接入 MCP 的维度会降低报告可信度，但不被当作失败。

## 目录

```text
backend/
  app/agents/                 # 7 个当前 Agent
  app/schemas/gaming_mouse.py # 电竞鼠标专业 schema
  app/services/               # 事实库、评分、证据、可追溯服务
  orchestration/workflow.py   # LangGraph DAG
data/products/gaming_mice.json
frontend/src/                 # React 前端
docs/                         # 架构、协议、API 文档
```

## 启动

后端：

```bash
cd backend
..\.venv\Scripts\python.exe main.py
```

前端：

```bash
cd frontend
npm run dev
```

## 验证

```bash
cd frontend
npx tsc --noEmit
```

```bash
cd backend
..\.venv\Scripts\python.exe test_product_compare_flow.py
..\.venv\Scripts\python.exe test_workflow.py
..\.venv\Scripts\python.exe test_traceability.py
```
