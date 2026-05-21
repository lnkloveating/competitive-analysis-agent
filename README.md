# 🎯 AI 驱动的竞品分析 Agent 协作系统

> 面向国内外长视频平台的 AI 竞品战略分析 Agent 系统

## 项目简介

本系统模拟一个"数字调研小组"，由 7 个专职 Agent 自动完成从公开信息采集到结构化竞品战略报告的全链路产出，并通过 Agent 间交叉审查与反馈机制实现自我校验。

## Demo 竞品范围

| 平台 | 类型 |
|---|---|
| 腾讯视频 | 国内长视频 |
| 爱奇艺 | 国内长视频 |
| 芒果TV | 国内长视频 |
| Netflix | 国际流媒体 |
| Disney+ | 国际流媒体 |

## 系统架构

```
Research Agent      → 公开信息采集
Evidence Agent      → 证据结构化 & 可信度评分
Product Agent       → 产品功能矩阵分析
Business Agent      → 商业模式 & 会员体系分析
Risk Agent          → 风险识别 & 数据质量检查
Quality Agent       → 质检 & 打回重做
Strategy Agent      → 最终报告生成
```

## Agent 工作流（DAG）

```
Research Agent
      ↓
Evidence Agent
      ↓
   ┌──┴──┐
Product  Business
Agent    Agent
   └──┬──┘
      ↓
  Risk Agent
      ↓
Quality Agent ──→ 打回（循环重做）
      ↓ 通过
Strategy Agent
      ↓
   最终报告
```

## 技术栈

- **后端**：Python + LangGraph + FastAPI
- **前端**：React + Vite + TailwindCSS
- **模型**：Doubao-Seed-2.0-lite
- **可观测性**：LangSmith
- **数据库**：SQLite

## 快速开始

### 后端

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # 填入 ARK_API_KEY 和 EP
python main.py
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

## 目录结构

```
competitive-analysis-agent/
├── backend/
│   ├── agents/          # 7个Agent实现
│   ├── schemas/         # 竞品知识Schema & Evidence Schema
│   ├── api/             # FastAPI 接口
│   └── utils/           # 工具函数
├── frontend/
│   └── src/
│       ├── pages/       # 5个核心页面
│       └── components/  # 公共组件
├── data/
│   ├── mock/            # Mock数据
│   └── evidence/        # 采集的证据数据
├── docs/                # 架构文档
└── README.md
```

## 分工

| 成员 | 负责 |
|---|---|
| A（王泽昊） | 前端展示 + 产品体验 |
| B | 后端 + LangGraph Agent 编排 |
| C | 数据源 + Evidence Schema + 证据链 |

## 提交材料

- [ ] 方案文档
- [ ] 演示视频
- [ ] 代码库（本仓库）
- [ ] README
- [ ] 架构图

## 时间节点

| 时间 | 节点 |
|---|---|
| 5月20日 | 开营，项目启动 |
| 5月21日 | 架构确认，各自开始开发 |
| 6月10日 | 提交成果 |
| 6月12-19日 | 答辩 |
