# AI 椹卞姩鐨勭珵鍝佸垎鏋?Agent 鍗忎綔绯荤粺

杩欐槸涓€涓潰鍚戠珵鍝佸垎鏋愬満鏅殑澶?Agent 鍚庣椤圭洰锛屼娇鐢?FastAPI + LangGraph 缂栨帓澶氫釜涓撲笟 Agent锛屾ā鎷熶竴涓粨鏋勫寲鏁板瓧璋冪爺灏忕粍锛屼粠鍏紑鏉愭枡閲囬泦銆佽瘉鎹娊鍙栥€佷骇鍝?鍟嗕笟鍒嗘瀽銆侀闄╄瘑鍒€佽川閲忔鏌ュ埌鏈€缁堟姤鍛婄敓鎴愶紝褰㈡垚鍙拷婧殑鍒嗘瀽閾捐矾銆?

褰撳墠 Demo 绗竴闃舵鑱氱劍 `gaming_mouse` 鐢电珵榧犳爣鍨傜洿鍦烘櫙锛岃€屼笉鏄硾鐢电珵澶栬銆?

## Demo 鍦烘櫙

褰撳墠鎺ㄨ崘 Demo 琛屼笟锛?

```text
industry_key = "gaming_mouse"
industry_name = "鐢电珵榧犳爣"
```

瑕嗙洊鍝佺墝锛?

| 鍝佺墝 | 浠ｈ〃鍨嬪彿 |
|---|---|
| 缃楁妧 | G Pro X Superlight 2銆丟502 X Plus |
| 闆疯泧 | Viper V3 Pro銆丏eathAdder V3 Pro |
| 娴风洍鑸?| M75 Air銆丼ABRE RGB PRO Wireless |

瑕嗙洊缁村害锛?

- 鎬ц兘鍙傛暟
- 杞婚噺鍖栬璁?
- 鏃犵嚎涓庣画鑸?
- 杞欢鐢熸€?
- 鐢ㄦ埛鍙ｇ
- 浠锋牸瀹氫綅
- 鐢电珵鍝佺墝褰卞搷鍔?

閫夋嫨鐢电珵榧犳爣浣滀负绗竴闃舵 Demo 鐨勫師鍥狅細

- 榧犳爣鍙傛暟鏄庣‘锛岄€傚悎缁撴瀯鍖栧姣旓紱
- 鍏紑鏁版嵁鍜岃瘎娴嬭祫鏂欏厖瓒筹紝閫傚悎 evidence-grounded 鍒嗘瀽锛?
- 鐢ㄦ埛璇勮涓板瘜锛岄€傚悎灞曠ず Evidence -> Claim -> Report 婧簮閾捐矾锛?
- 鍦烘櫙瓒冲鍨傜洿锛屼究浜庡墠绔仛娓呮櫚鐨?Agent 宸ヤ綔鍙版紨绀恒€?

`gaming_peripherals` 娉涚數绔炲璁鹃厤缃粛鐒朵繚鐣欙紝鍚庣画鍙互缁х画鎵╁睍鍒伴敭鐩樸€佽€虫満銆佹墜鏌勭瓑澶栬鍝佺被銆?

## 绯荤粺鑳藉姏

- 澶?Agent 鍗忎綔绔炲搧鍒嗘瀽 workflow
- 琛屼笟閰嶇疆椹卞姩锛屾敮鎸佸琛屼笟鎵╁睍
- ResearchProvider 鎶借薄锛屽綋鍓嶄娇鐢?MockResearchProvider锛屾湭鏉ュ彲鏇挎崲鐪熷疄鐖櫕
- 姣忎釜 Agent 杈撳嚭缁忚繃 Pydantic Schema 鏍￠獙
- ProductAgent / BusinessAgent 鐢熸垚缁撴瀯鍖?claims
- StrategyAgent 鏈€缁堟姤鍛婂繀椤诲紩鐢ㄥ凡鏈?claim_id 鍜?evidence_id
- QualityAgent 鏀寔缁撴瀯鍖栨墦鍥炲拰涓夋澶辫触鍚庝汉宸ュ鏍?
- trace_log 璁板綍 Agent 鎵ц杞ㄨ抗锛屼究浜庡墠绔睍绀哄拰绛旇京璇存槑
- FastAPI 鎻愪緵浠诲姟鍚姩銆佺姸鎬佹煡璇€佹姤鍛婃煡璇㈠拰鍙涓棿浜х墿鎺ュ彛

## Agent 宸ヤ綔娴?

```text
ResearchAgent
  -> EvidenceAgent
  -> ProductAgent / BusinessAgent
  -> RiskAgent
  -> QualityAgent
       | approved
       v
     StrategyAgent
       |
       v
     final_report
```

璐ㄩ噺妫€鏌ュけ璐ユ椂锛?

```text
QualityAgent -> reject_to target Agent
```

涓夋鑷姩淇鍚庝粛澶辫触锛?

```text
QualityAgent -> HumanReviewRequired
```

绯荤粺涓嶄細鍦ㄨ瘉鎹笉瓒虫椂 force pass锛屼篃涓嶄細璁?StrategyAgent 鐢熸垚娌℃湁璇佹嵁鏀拺鐨勬寮忔姤鍛娿€?

## 鎶€鏈爤

- 鍚庣锛歅ython + FastAPI + LangGraph
- Agent 鐘舵€佺害鏉燂細TypedDict + Pydantic Schema
- LLM 鎺ュ叆锛欴oubao / Ark 瀹㈡埛绔皝瑁?
- 褰撳墠鏁版嵁鍏ュ彛锛歁ockResearchProvider
- 鍚庣画鏁版嵁鍏ュ彛锛欳rawlerResearchProvider锛岃鍙栫埇铏?JSON 骞舵牎楠屼负 `RawResearchItem`
- 鍓嶇锛歊eact + Vite + TailwindCSS

## 鍚庣鐩綍缁撴瀯

```text
backend/
  app/
    main.py
    api/
      analysis.py
      industries.py
      health.py
    agents/
      research_agent.py
      evidence_agent.py
      product_agent.py
      business_agent.py
      risk_agent.py
      quality_agent.py
      strategy_agent.py
    core/
      agent_runner.py
      config.py
      errors.py
      logging.py
    schemas/
      research.py
      evidence.py
      claim.py
      product.py
      business.py
      risk.py
      quality.py
      report.py
      trace.py
      metrics.py
      state.py
    services/
      research_provider.py
      mock_research_provider.py
      llm_client.py
      metrics_service.py
  orchestration/
    workflow.py            # LangGraph DAG and routing
    state.py               # workflow state and reducers
    industry_config.py     # industry presets
```

`backend/orchestration` is the workflow orchestration layer. Real agent implementations live in `backend/app/agents`.

## 蹇€熷紑濮?

### 鍚庣

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
python main.py
```

榛樿鏈嶅姟鍦板潃锛?

```text
http://localhost:8000
```

鍋ュ悍妫€鏌ワ細

```text
GET /health
```

### 鍓嶇

```bash
cd frontend
npm install
npm run dev
```

## Demo 璇锋眰绀轰緥

```json
{
  "target_platform": "缃楁妧",
  "competitors": ["缃楁妧", "闆疯泧", "娴风洍鑸?],
  "analysis_scene": "鐢电珵榧犳爣绔炲搧鍒嗘瀽",
  "target_user": "浜у搧缁忕悊",
  "time_range": "杩戜袱骞?,
  "focus_dimensions": [
    "鎬ц兘鍙傛暟",
    "杞婚噺鍖栬璁?,
    "鏃犵嚎涓庣画鑸?,
    "杞欢鐢熸€?,
    "鐢ㄦ埛鍙ｇ",
    "浠锋牸瀹氫綅",
    "鐢电珵鍝佺墝褰卞搷鍔?
  ],
  "industry_key": "gaming_mouse"
}
```

璋冪敤锛?

```text
POST /api/analysis/start
```

鎷垮埌 `task_id` 鍚庤疆璇細

```text
GET /api/analysis/{task_id}/status
```

瀹屾垚鍚庤鍙栵細

```text
GET /api/analysis/{task_id}/report
GET /api/analysis/{task_id}/trace
GET /api/analysis/{task_id}/evidence
GET /api/analysis/{task_id}/claims
```

## FastAPI 鎺ュ彛

鏍稿績鎺ュ彛锛?

- `POST /api/analysis/start`
- `GET /api/analysis/{task_id}/status`
- `GET /api/analysis/{task_id}/report`
- `GET /api/industries`
- `GET /health`

Agent 宸ヤ綔鍙板彧璇绘帴鍙ｏ細

- `GET /api/analysis/{task_id}/evidence`
- `GET /api/analysis/{task_id}/claims`
- `GET /api/analysis/{task_id}/trace`
- `GET /api/analysis/{task_id}/quality`
- `GET /api/analysis/{task_id}/metrics`
- `GET /api/analysis/{task_id}/risks`
- `GET /api/analysis/{task_id}/artifacts`

瀹屾暣鎺ュ彛璇存槑瑙侊細

```text
docs/api.md
```

Agent 鍗忚璇存槑瑙侊細

```text
docs/agent_protocol.md
```

## MockResearchProvider

褰撳墠娌℃湁鎺ョ湡瀹炵埇铏€俙MockResearchProvider` 浼氭牴鎹?`industry_key` 鐢熸垚 mock raw research銆?

褰?`industry_key = "gaming_mouse"` 鏃讹紝mock 鏁版嵁浼氬洿缁曠數绔為紶鏍囩敓鎴愶紝骞惰鐩栵細

- 缃楁妧銆侀浄铔囥€佹捣鐩楄埞涓変釜鍝佺墝锛?
- 浠ｈ〃鍨嬪彿锛?
- 涓冧釜鏍稿績缁村害锛?
- `official`銆乣review`銆乣ecommerce`銆乣user_review`銆乣news`銆乣report` 绛?source type锛?
- `mock://gaming_mouse/...` 椋庢牸 URL锛?
- `dimension`銆乣related_dimension`銆乣product_name`銆乣category` 鍏煎瀛楁銆?

鍚庣画鎺ョ湡瀹炵埇铏椂锛屽彧闇€瑕佸疄鐜版柊鐨?`CrawlerResearchProvider`锛岃瀹冭緭鍑虹鍚?`RawResearchItem` schema 鐨勬暟鎹嵆鍙€?

## 娴嬭瘯

甯哥敤鍚庣娴嬭瘯锛?

```bash
backend\venv\Scripts\python.exe backend\test_workflow.py
backend\venv\Scripts\python.exe backend\test_agents.py
backend\venv\Scripts\python.exe backend\test_traceability.py
backend\venv\Scripts\python.exe backend\test_api_readonly.py
backend\venv\Scripts\python.exe backend\test_gaming_mouse_config.py
```

`test_gaming_mouse_config.py` 浼氭鏌ワ細

- 琛屼笟閰嶇疆鍖呭惈 `gaming_mouse`锛?
- 鍝佺墝瑕嗙洊缃楁妧銆侀浄铔囥€佹捣鐩楄埞锛?
- 缁村害瑕嗙洊涓冧釜鐢电珵榧犳爣鏍稿績缁村害锛?
- MockResearchProvider 杩斿洖绗﹀悎 `RawResearchItem` 鐨勬暟鎹紱
- mock 鏁版嵁瑕嗙洊涓変釜鍝佺墝鍜屼唬琛ㄥ瀷鍙枫€?

## 璁捐鍘熷垯

- Schema-first Agent communication
- Evidence-grounded claims
- No unsupported final report
- Quality rejection before strategy generation
- Human review instead of force pass
- Backward compatibility during migration
- Traceable and frontend-readable intermediate artifacts
- Industry-config driven extensibility

褰撳墠绯荤粺涓嶆槸鏅€?LLM 鎶ュ憡鐢熸垚鍣紝鑰屾槸 evidence-grounded銆乻chema-validated銆乹uality-controlled 鐨勫 Agent 绔炲搧鍒嗘瀽宸ヤ綔娴併€?
