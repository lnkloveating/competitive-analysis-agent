# Agent Protocol

## 1. Overview

鏈郴缁熸槸涓€涓 Agent 鍗忎綔鐨勭珵鍝佸垎鏋愬悗绔紝浣跨敤 LangGraph 缂栨帓 7 涓?Agent锛屾ā鎷熶竴涓粨鏋勫寲鏁板瓧璋冪爺灏忕粍銆?

褰撳墠涓绘祦绋嬶細

```text
ResearchAgent
  -> EvidenceAgent
  -> ProductAgent / BusinessAgent
  -> RiskAgent
  -> QualityAgent
  -> StrategyAgent
```

鍏朵腑 `ProductAgent` 鍜?`BusinessAgent` 鍙互骞惰鎵ц锛屾渶缁堥€氳繃 state reducer 鍚堝苟 `claims` 鍜?`trace_log`銆?

鏍稿績绾︽潫锛?

- Agent 涔嬮棿涓嶆槸鑷敱鑱婂ぉ锛岃€屾槸閫氳繃缁撴瀯鍖?`state` 浼犻€掍俊鎭€?
- 姣忎釜 Agent 鏈夋槑纭亴璐ｈ竟鐣岋紝鍙鍐欒嚜宸辫礋璐ｇ殑瀛楁銆?
- 姣忎釜鏍稿績杈撳嚭閮界粡杩?Pydantic Schema 鏍￠獙銆?
- 鏈€缁堟姤鍛婂繀椤诲紩鐢ㄥ凡鏈?`claims` 鍜?`evidence_ids`銆?
- `QualityAgent` 鍙互缁撴瀯鍖栧畾鍚戞墦鍥烇紝渚嬪鎵撳洖 `EvidenceAgent`銆乣ProductAgent` 鎴?`BusinessAgent`銆?
- 涓夋鑷姩淇澶辫触鍚庤繘鍏?`HumanReviewRequired`锛屼笉浼?force pass銆?

褰撳墠绯荤粺涓嶆槸鏅€?LLM 鎶ュ憡鐢熸垚鍣紝鑰屾槸 evidence-grounded銆乻chema-validated銆乹uality-controlled 鐨勫 Agent 绔炲搧鍒嗘瀽宸ヤ綔娴併€?

## 2. Agent Workflow

姝ｅ父璺緞锛?

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

璐ㄩ噺鎵撳洖璺緞锛?

```text
QualityAgent
  -> reject_to target Agent
  -> rerun downstream workflow
```

涓夋澶辫触鍚庣殑浜哄伐瀹℃牳璺緞锛?

```text
QualityAgent
  -> HumanReviewRequired
  -> human-review draft final_report
```

`QualityAgent` 杈撳嚭 `reject_to`锛屽彲閫夌洰鏍囧寘鎷細

- `ResearchAgent`
- `EvidenceAgent`
- `ProductAgent`
- `BusinessAgent`
- `RiskAgent`
- `StrategyAgent`

濡傛灉 `iteration_count >= 3` 鍚庝粛鐒?rejected锛岀郴缁熻繘鍏?human review mode锛屽苟璁剧疆锛?

```text
needs_human_review = True
quality_status = "rejected_after_max_iterations"
is_approved = False
```

## 3. State Contract

workflow state 鏄?Agent 闂村敮涓€鍙俊鐨勬暟鎹氦鎹㈠崗璁€傛牳蹇冨瓧娈靛涓嬶細

| Field | Type | Description |
|---|---|---|
| `raw_research` | `list[dict]` | `ResearchAgent` 閲囬泦鎴?mock 鐨勫師濮嬭皟鐮旀潗鏂?|
| `evidence_list` | `list[dict]` | `EvidenceAgent` 鐢熸垚鐨勭粨鏋勫寲璇佹嵁 |
| `product_matrix` | `dict` | `ProductAgent` 鐢熸垚鐨勪骇鍝佺淮搴︾煩闃?|
| `business_matrix` | `dict` | `BusinessAgent` 鐢熸垚鐨勫晢涓氱淮搴︾煩闃?|
| `claims` | `list[dict]` | `ProductAgent` / `BusinessAgent` 鐢熸垚鐨勭粨鏋勫寲缁撹 |
| `risk_flags` | `list[dict]` | `RiskAgent` 鐢熸垚鐨勯闄╂爣璁?|
| `quality_result` | `dict` | `QualityAgent` 鐢熸垚鐨勮川妫€缁撴灉 |
| `final_report` | `dict` | `StrategyAgent` 鎴?`HumanReviewRequired` 鐢熸垚鐨勬姤鍛?|
| `trace_log` | `list[dict]` | Agent 鎵ц杞ㄨ抗 |
| `metrics` | `dict` | 鎶ュ憡璐ㄩ噺鎸囨爣锛屽綋鍓嶅彲鑳戒负绌哄璞?|
| `used_claim_ids` | `list[str]` | `final_report` 浣跨敤杩囩殑 `claim_id` |
| `used_evidence_ids` | `list[str]` | `final_report` 浣跨敤杩囩殑 `evidence_id` |
| `current_agent` | `str` | 褰撳墠 Agent 鎴栨渶杩戝畬鎴愮殑 Agent |
| `iteration_count` | `int` | `QualityAgent` 鑷姩鎵撳洖娆℃暟 |
| `rejected_agents` | `list[str]` | 琚墦鍥炶繃鐨?Agent |
| `is_approved` | `bool` | 褰撳墠 workflow 鏄惁閫氳繃璐ㄩ噺妫€鏌?|
| `needs_human_review` | `bool` | 鏄惁闇€瑕佷汉宸ュ鏍?|
| `quality_status` | `str` | `approved` / `rejected_after_max_iterations` 绛夌姸鎬?|

骞惰鍒嗘敮璇存槑锛?

- `ProductAgent` 鍜?`BusinessAgent` 閮戒細杩藉姞 `claims`銆?
- `ProductAgent` 鍜?`BusinessAgent` 閮戒細杩藉姞 `trace_log`銆?
- workflow state 宸查€氳繃 reducer 鍚堝苟杩欎袱涓瓧娈碉紝閬垮厤骞惰鍒嗘敮瑕嗙洊褰兼杈撳嚭銆?

## 4. Orchestration Layer

褰撳墠鐩綍缁撴瀯锛?

```text
backend/orchestration/
  workflow.py            # LangGraph DAG, routing, retry/human review handoff
  state.py               # shared workflow state and merge reducers
  industry_config.py     # industry presets and dimensions

backend/app/agents/
  research_agent.py      # real implementation
  evidence_agent.py      # real implementation
  product_agent.py       # real implementation
  business_agent.py      # real implementation
  verification_agent.py  # real implementation
  risk_agent.py          # real implementation
  quality_agent.py       # real implementation
  strategy_agent.py      # real implementation
```

`backend/orchestration` only owns workflow assembly, routing, state reducers, and industry presets. Agent business logic stays in `backend/app/agents`.

## Gaming Mouse Demo Scenario

褰撳墠 Demo 绗竴闃舵鑱氱劍 `gaming_mouse` 鐢电珵榧犳爣鍨傜洿鍦烘櫙锛岃€屼笉鏄硾鐢电珵澶栬銆?

閫夋嫨鐢电珵榧犳爣鐨勫師鍥狅細

- 榧犳爣鍙傛暟鏄庣‘锛岄€傚悎缁撴瀯鍖栧姣旓紝渚嬪浼犳劅鍣ㄣ€丏PI銆佸洖鎶ョ巼銆侀噸閲忋€佹棤绾跨画鑸€?
- 鍏紑鏁版嵁鍏呰冻锛岄€傚悎 evidence-grounded 鍒嗘瀽銆?
- 鐢ㄦ埛璇勮鍜岃瘎娴嬪唴瀹逛赴瀵岋紝閫傚悎灞曠ず Evidence -> Claim -> Report 婧簮閾捐矾銆?
- 鍚庣浠嶇劧閫氳繃 `industry_config` 鏀寔澶氳涓氭墿灞曪紝`gaming_peripherals` 娌℃湁鍒犻櫎銆?

褰撳墠 `gaming_mouse` 瑕嗙洊鍝佺墝锛?

- 缃楁妧
- 闆疯泧
- 娴风洍鑸?

浠ｈ〃鍨嬪彿锛?

| 鍝佺墝 | 浠ｈ〃鍨嬪彿 |
|---|---|
| 缃楁妧 | `G Pro X Superlight 2`銆乣G502 X Plus` |
| 闆疯泧 | `Viper V3 Pro`銆乣DeathAdder V3 Pro` |
| 娴风洍鑸?| `M75 Air`銆乣SABRE RGB PRO Wireless` |

鏍稿績缁村害锛?

- 鎬ц兘鍙傛暟
- 杞婚噺鍖栬璁?
- 鏃犵嚎涓庣画鑸?
- 杞欢鐢熸€?
- 鐢ㄦ埛鍙ｇ
- 浠锋牸瀹氫綅
- 鐢电珵鍝佺墝褰卞搷鍔?

Mock 鏁版嵁鏉ユ簮绫诲瀷瑕嗙洊锛?

- `official`
- `review`
- `ecommerce`
- `user_review`
- `news`
- `report`

Mock URL 浣跨敤 `mock://gaming_mouse/...` 椋庢牸锛屽苟鍖呭惈 `dimension`銆乣related_dimension`銆乣product_name`銆乣category` 鍏煎瀛楁锛屾柟渚垮悗缁?Agent 璇嗗埆琛屼笟銆佷骇鍝佸拰缁村害銆?

## 5. Agent Protocol Details

### 5.1 ResearchAgent

**Implementation:** `backend/app/agents/research_agent.py`  
**Orchestrated by:** `backend/orchestration/workflow.py`

#### Responsibility

璐熻矗閲囬泦绔炲搧鍏紑淇℃伅銆傚綋鍓嶉€氳繃 `MockResearchProvider` 鐢熸垚 LLM mock 鎴?deterministic mock 鏁版嵁銆傛湭鏉ユ帴鐪熷疄鐖櫕鏃讹紝鍙互鎵╁睍涓?`CrawlerResearchProvider`銆?

褰?`industry_key = "gaming_mouse"` 鏃讹紝`MockResearchProvider` 浼氱敓鎴愮數绔為紶鏍?mock 鏁版嵁锛岃鐩栵細

- 缃楁妧 `G Pro X Superlight 2`銆乣G502 X Plus`
- 闆疯泧 `Viper V3 Pro`銆乣DeathAdder V3 Pro`
- 娴风洍鑸?`M75 Air`銆乣SABRE RGB PRO Wireless`

骞惰鐩?source type锛?

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
- `trace_log` 杩藉姞 `ResearchAgent` 鎵ц璁板綍

#### Schema

`RawResearchItem`

瀛楁鍖呮嫭锛?

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

- 涓嶇敓鎴?`evidence_list`
- 涓嶇敓鎴?`claims`
- 涓嶇敓鎴?`product_matrix`
- 涓嶇敓鎴?`business_matrix`
- 涓嶇敓鎴?`final_report`

#### Notes

- 褰撳墠 mock URL 浣跨敤 `mock://...`銆?
- `crawl_method = "llm_mock"`銆?
- 鐪熷疄鐖櫕鍙渶瑕佸疄鐜?`ResearchProvider.collect(state)` 鎺ュ彛銆?

### 5.2 EvidenceAgent

**Implementation:** `backend/app/agents/evidence_agent.py`  
**Orchestrated by:** `backend/orchestration/workflow.py`

#### Responsibility

灏?`raw_research` 杞崲涓虹粨鏋勫寲璇佹嵁銆?

鍦?`gaming_mouse` 鍦烘櫙涓嬶紝閲嶇偣璇嗗埆杩欎簺缁村害锛?

- 鎬ц兘鍙傛暟
- 杞婚噺鍖栬璁?
- 鏃犵嚎涓庣画鑸?
- 杞欢鐢熸€?
- 鐢ㄦ埛鍙ｇ
- 浠锋牸瀹氫綅
- 鐢电珵鍝佺墝褰卞搷鍔?

#### Inputs

- `state["raw_research"]`
- `state["competitors"]`
- `state["focus_dimensions"]`

#### Outputs

- `state["evidence_list"]`
- `state["current_agent"] = "EvidenceAgent"`
- `trace_log` 杩藉姞 `EvidenceAgent` 鎵ц璁板綍

#### Schema

`EvidenceItem`

瀛楁鍖呮嫭锛?

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

鍏煎瀛楁锛?

- `dimension`
- `content`
- `summary`
- `source`
- `used_by_agent`

#### Forbidden Behaviors

- 涓嶇敓鎴?`final_report`
- 涓嶇敓鎴?`product_matrix`
- 涓嶇敓鎴?`business_matrix`
- 涓嶆柊澧炰笌 `raw_research` 鏃犲叧鐨勮瘉鎹?

#### Notes

- `evidence_id` 浣跨敤绋冲畾搴忓彿锛歚EV001`銆乣EV002`銆乣EV003`銆?
- 姣忔潯 evidence 閮介渶瑕佽兘閫氳繃 `EvidenceItem` schema 鏍￠獙銆?

### 5.3 ProductAgent

**Implementation:** `backend/app/agents/product_agent.py`  
**Orchestrated by:** `backend/orchestration/workflow.py`

#### Responsibility

鍩轰簬 `evidence_list` 鐢熸垚浜у搧缁村害鍒嗘瀽锛岃緭鍑?`product_matrix`锛屽苟鐢熸垚 `PCL` 寮€澶寸殑 product claims銆?

鍦?`gaming_mouse` 鍦烘櫙涓嬶紝`ProductAgent` 閲嶇偣鍏虫敞锛?

- 浼犳劅鍣?/ DPI / 鍥炴姤鐜?/ 寤惰繜
- 閲嶉噺 / 杞婚噺鍖?
- 澶栧舰 / 鎵嬫劅 / 浜轰綋宸ュ
- 鏃犵嚎杩炴帴 / 缁埅
- 椹卞姩杞欢 / 閰嶇疆鑳藉姏
- 鐢ㄦ埛浣撻獙鍜屽父瑙侀棶棰?

#### Inputs

- `state["evidence_list"]`
- `state["competitors"]`
- `state["focus_dimensions"]`

#### Outputs

- `state["product_matrix"]`
- append `state["claims"]`
- `state["current_agent"] = "ProductAgent"`
- `trace_log` 杩藉姞 `ProductAgent` 鎵ц璁板綍

#### Schema

- `ProductAgentOutput`
- `Claim`

`product_matrix` 鍏煎缁撴瀯锛?

```text
dimensions -> dimension -> platform -> score / summary / evidence_ids
```

鏂板瀛楁锛?

- `analysis`
- `confidence_score`

Claim 绀轰緥锛?

```json
{
  "claim_id": "PCL001",
  "content": "缃楁妧鍦ㄦ€ц兘鍙傛暟缁村害鏈夎緝澶氳瘉鎹敮鎸併€?,
  "dimension": "鎬ц兘鍙傛暟",
  "related_platforms": ["缃楁妧"],
  "evidence_ids": ["EV001"],
  "confidence_score": 0.8,
  "generated_by": "ProductAgent"
}
```

#### Forbidden Behaviors

- 涓嶇敓鎴愭柊鐨?evidence
- 涓嶇敓鎴?`BusinessAgent` 鐨勫晢涓氱粨璁?
- 涓嶇敓鎴?`final_report`
- 涓嶅垱寤烘病鏈?`evidence_ids` 鐨?claim
- 涓嶅紩鐢ㄤ笉瀛樺湪鐨?`evidence_id`

#### Notes

`claim_id` 浣跨敤 `PCL001`銆乣PCL002` 绛夌ǔ瀹氬簭鍙枫€?

### 5.4 BusinessAgent

**Implementation:** `backend/app/agents/business_agent.py`  
**Orchestrated by:** `backend/orchestration/workflow.py`

#### Responsibility

鍩轰簬 `evidence_list` 鐢熸垚鍟嗕笟缁村害鍒嗘瀽锛岃緭鍑?`business_matrix`锛屽苟鐢熸垚 `BCL` 寮€澶寸殑 business claims銆?

鍦?`gaming_mouse` 鍦烘櫙涓嬶紝`BusinessAgent` 閲嶇偣鍏虫敞锛?

- 浠锋牸瀹氫綅
- 鐢电珵鍝佺墝褰卞搷鍔?
- 浜у搧绾跨瓥鐣?
- 鐩爣鐢ㄦ埛瀹氫綅
- 娓犻亾鍜岄攢鍞瓥鐣?

#### Inputs

- `state["evidence_list"]`
- `state["competitors"]`
- `state["focus_dimensions"]`

#### Outputs

- `state["business_matrix"]`
- append `state["claims"]`
- `state["current_agent"] = "BusinessAgent"`
- `trace_log` 杩藉姞 `BusinessAgent` 鎵ц璁板綍

#### Schema

- `BusinessAgentOutput`
- `Claim`

`business_matrix` 鍏煎缁撴瀯锛?

```text
dimensions -> dimension -> platform -> score / summary / evidence_ids
```

鏂板瀛楁锛?

- `analysis`
- `confidence_score`

Claim 绀轰緥锛?

```json
{
  "claim_id": "BCL001",
  "content": "闆疯泧鍦ㄤ环鏍煎畾浣嶄笂鏇村亸鍚戦珮绔數绔炵敤鎴枫€?,
  "dimension": "浠锋牸瀹氫綅",
  "related_platforms": ["闆疯泧"],
  "evidence_ids": ["EV006"],
  "confidence_score": 0.76,
  "generated_by": "BusinessAgent"
}
```

#### Forbidden Behaviors

- 涓嶇敓鎴愭柊鐨?evidence
- 涓嶇敓鎴?`ProductAgent` 鐨勬妧鏈粏鑺傜粨璁?
- 涓嶇敓鎴?`final_report`
- 涓嶅垱寤烘病鏈?`evidence_ids` 鐨?claim
- 涓嶅紩鐢ㄤ笉瀛樺湪鐨?`evidence_id`

#### Notes

- `claim_id` 浣跨敤 `BCL001`銆乣BCL002` 绛夌ǔ瀹氬簭鍙枫€?
- `ProductAgent` 鍜?`BusinessAgent` 骞惰鏃讹紝`claims` 浼氶€氳繃 reducer 鍚堝苟銆?

### 5.5 RiskAgent

**Implementation:** `backend/app/agents/risk_agent.py`  
**Orchestrated by:** `backend/orchestration/workflow.py`

#### Responsibility

鍩轰簬 evidence銆乧laims銆乸roduct matrix銆乥usiness matrix 璇嗗埆椋庨櫓锛岃緭鍑虹粨鏋勫寲 `risk_flags`銆?

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
- `trace_log` 杩藉姞 `RiskAgent` 鎵ц璁板綍

#### Schema

- `RiskAgentOutput`
- `RiskFlag`

`risk_type` 鍙厑璁革細

- `data_credibility`
- `data_timeliness`
- `evidence_gap`
- `compliance`

鍏煎瀛楁锛?

- `risk_id`
- `affected_platform`
- `affected_dimension`
- `suggestion`
- `related_evidence_ids`

#### Implemented Rules

- low credibility 鍗犳瘮杩囬珮
- claim 浠呯敱 low evidence 鏀拺
- `publish_time` 缂哄け杈冨
- 璇佹嵁瓒呰繃 2 骞?/ 3 骞?
- 绔炲搧缂鸿瘉鎹?
- 缁村害缂鸿瘉鎹?
- matrix cell 缂?`evidence_ids`
- `user_review` 涓枒浼煎寘鍚敤鎴峰悕銆乣user_id`銆乣profile`銆佸ご鍍忋€佷富椤点€乪mail銆佹墜鏈哄彿绛夐殣绉佷俊鎭?

#### Forbidden Behaviors

- 涓嶇敓鎴?evidence
- 涓嶇敓鎴?claims
- 涓嶄慨鏀?`product_matrix`
- 涓嶄慨鏀?`business_matrix`
- 涓嶅喅瀹氭槸鍚?approved
- 涓嶇敓鎴?`final_report`

#### Notes

`RiskAgent` 鍙礋璐ｈ瘑鍒闄┿€傛槸鍚︽墦鍥炵敱 `QualityAgent` 鍐冲畾銆?

### 5.6 QualityAgent

**Implementation:** `backend/app/agents/quality_agent.py`  
**Orchestrated by:** `backend/orchestration/workflow.py`

#### Responsibility

瀵?workflow 涓棿浜х墿杩涜缁撴瀯鍖栬川閲忔鏌ワ紝鍒ゆ柇鏄惁 approved銆傚鏋?rejected锛岃緭鍑?`reject_to`銆乣reject_reason`銆乣required_actions`銆備笁娆″け璐ュ悗杩涘叆 human review mode銆?

褰撳墠 `QualityAgent` 宸叉鏌?competitor / dimension / evidence_ids / matrix / high risk 绛夐€氱敤璐ㄩ噺瑙勫垯銆?

`gaming_mouse` 鐨勪唬琛ㄥ瀷鍙疯鐩栨鏌ユ殏鏈姞鍏?`QualityAgent` 寮鸿鍒欍€傜洰鍓嶉€氳繃 `MockResearchProvider` 鐨?mock 鏁版嵁鍜?`backend/test_gaming_mouse_config.py` 淇濊瘉涓変釜鍝佺墝銆佷竷涓淮搴﹀拰浠ｈ〃鍨嬪彿瑕嗙洊銆傝繖涓€椤瑰彲浣滀负 future extension銆?

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
- `trace_log` 杩藉姞 `QualityAgent` 鎵ц璁板綍

#### Schema

`QualityResult`

鏍稿績妫€鏌ワ細

- claims 鏄惁閮芥湁 `evidence_ids`
- claim 寮曠敤鐨?`evidence_ids` 鏄惁鐪熷疄瀛樺湪
- 姣忎釜 competitor 鏄惁鏈?evidence 瑕嗙洊
- 姣忎釜 `focus_dimension` 鏄惁鏈?evidence 瑕嗙洊
- `product_matrix` 鏄惁涓虹┖
- `business_matrix` 鏄惁涓虹┖
- 鏄惁瀛樺湪 high severity risk

Rejected 杈撳嚭鍖呮嫭锛?

- `reject_to`
- `reject_reason`
- `required_actions`
- `missing_dimensions`
- `missing_platforms`
- `checked_items`

鍏煎瀛楁锛?

- `status`
- `quality_score`
- `reason`
- `target_agent`
- `required_fix`

#### Forbidden Behaviors

- 涓嶇敓鎴?evidence
- 涓嶇敓鎴?claims
- 涓嶇敓鎴?`final_report`
- 涓嶆妸 rejected 鐘舵€佸己鍒舵爣璁颁负 approved
- 涓嶈 LLM 鍦ㄨ瘉鎹笉瓒虫椂缂栭€犲唴瀹?

#### Notes

Human review 瑙﹀彂鏉′欢锛?

```text
iteration_count >= 3 and still rejected
```

瑙﹀彂鍚庤缃細

```text
needs_human_review = True
quality_status = "rejected_after_max_iterations"
is_approved = False
```

### 5.7 StrategyAgent

**Implementation:** `backend/app/agents/strategy_agent.py`  
**Orchestrated by:** `backend/orchestration/workflow.py`

#### Responsibility

鍦?`QualityAgent` approved 鍚庣敓鎴愭寮?`final_report`銆傛姤鍛婂熀浜?claims銆乸roduct matrix銆乥usiness matrix銆乺isk flags銆乹uality result 鐢熸垚锛屽苟淇濊瘉鎶ュ憡涓殑 claim/evidence 寮曠敤鐪熷疄瀛樺湪銆?

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
- `trace_log` 杩藉姞 `StrategyAgent` 鎵ц璁板綍

#### Schema

`StrategyAgentOutput`

`final_report` 鏃у瓧娈靛吋瀹癸細

- `executive_summary`
- `competitive_ranking`
- `swot_analysis`

鏂板鏍囧噯瀛楁锛?

- `competitor_ranking`
- `swot`
- `strategic_recommendations`
- `risk_disclosure`
- `used_claim_ids`
- `used_evidence_ids`
- `quality_result`
- `metrics`

#### Rules

- `used_claim_ids` 蹇呴』鍏ㄩ儴鏉ヨ嚜 `state["claims"]`
- `used_evidence_ids` 蹇呴』鍏ㄩ儴鏉ヨ嚜 `state["evidence_list"]`
- `strategic_recommendations[].supporting_claim_ids` 蹇呴』鐪熷疄瀛樺湪
- `strategic_recommendations[].supporting_evidence_ids` 蹇呴』鐪熷疄瀛樺湪
- 涓嶅瓨鍦ㄧ殑 ID 浼氳杩囨护锛屼笉鍏佽杩涘叆 `final_report`

#### Forbidden Behaviors

- 涓嶇敓鎴愭柊鐨?evidence
- 涓嶇敓鎴愭柊鐨?claims
- 涓嶅紩鐢ㄤ笉瀛樺湪鐨?`claim_id`
- 涓嶅紩鐢ㄤ笉瀛樺湪鐨?`evidence_id`
- 涓嶅湪 rejected / `needs_human_review` 鐘舵€佷笅鐢熸垚姝ｅ紡鎶ュ憡
- 涓嶉殣钘?`risk_flags` 鍜?`quality_result`

#### Notes

濡傛灉 `needs_human_review = True` 鎴?`quality_result.approved = False`锛宍StrategyAgent` 鍙敓鎴愬緟浜哄伐瀹℃牳鑽夌锛屼笉鐢熸垚姝ｅ紡鎶ュ憡銆?

## 6. Claim and Evidence Traceability

Traceability 閾捐矾锛?

```text
RawResearchItem
  -> EvidenceItem
  -> Claim
  -> Strategy Recommendation
  -> Final Report
```

ID 瑙勫垯锛?

| Type | ID Format |
|---|---|
| Evidence ID | `EV001`, `EV002`, `EV003` |
| Product Claim ID | `PCL001`, `PCL002` |
| Business Claim ID | `BCL001`, `BCL002` |

鏍￠獙瑙勫垯锛?

- `Claim.evidence_ids` 蹇呴』瀛樺湪浜?`evidence_list`
- `final_report.used_claim_ids` 蹇呴』瀛樺湪浜?`claims`
- `final_report.used_evidence_ids` 蹇呴』瀛樺湪浜?`evidence_list`
- `strategic_recommendations[].supporting_claim_ids` 蹇呴』瀛樺湪浜?`claims`
- `strategic_recommendations[].supporting_evidence_ids` 蹇呴』瀛樺湪浜?`evidence_list`

褰撳墠宸叉湁 `backend/test_traceability.py` 妫€鏌ヨ繖浜涘紩鐢ㄩ摼锛岀‘淇濇渶缁堟姤鍛婁笉寮曠敤涓嶅瓨鍦ㄧ殑 claim 鎴?evidence銆?

## 7. Quality Feedback Loop

`QualityAgent` 涓嶆槸鍙繑鍥?pass/fail锛岃€屾槸杈撳嚭缁撴瀯鍖栬川妫€缁撴灉锛?

```json
{
  "approved": false,
  "score": 70,
  "reject_to": "EvidenceAgent",
  "reject_reason": "閮ㄥ垎鍒嗘瀽缁村害缂哄皯璇佹嵁銆?,
  "missing_dimensions": ["浠锋牸瀹氫綅"],
  "missing_platforms": [],
  "required_actions": ["琛ュ厖浠锋牸瀹氫綅鐩稿叧 evidence"],
  "checked_items": {
    "all_claims_have_evidence": true,
    "all_evidence_ids_valid": true,
    "all_competitors_covered": true,
    "all_dimensions_covered": false
  }
}
```

`reject_to` 鐨勮矾鐢卞惈涔夛細

| Problem | Typical reject_to |
|---|---|
| Evidence 缂哄け | `EvidenceAgent` |
| Product matrix 闂 | `ProductAgent` |
| Business matrix 闂 | `BusinessAgent` |
| Risk 楂橀闄?| `EvidenceAgent` / `RiskAgent` / `ResearchAgent` |

瀹為檯璺敱鐢?`quality_router` 鏍规嵁 `quality_result` 鍜?`iteration_count` 鍐冲畾銆?

## 8. Human Review Mode

濡傛灉 `QualityAgent` 鑷姩鎵撳洖 3 娆″悗浠嶇劧澶辫触锛岀郴缁熶笉浼?force pass锛屼篃涓嶄細璁?LLM 缂栭€犳寮忔姤鍛娿€?

绯荤粺杩涘叆锛?

```text
HumanReviewRequired
```

鐘舵€佸瓧娈碉細

```text
needs_human_review = True
quality_status = "rejected_after_max_iterations"
is_approved = False
```

姝ゆ椂 `final_report` 浼氬彉鎴愬緟浜哄伐瀹℃牳鑽夌锛屽寘鍚細

- `quality_result`
- `risk_flags`
- `missing_dimensions`
- `missing_platforms`
- `required_actions`
- `draft_product_matrix`
- `draft_business_matrix`
- `draft_claims`
- `disclaimer`

鍓嶇搴斿皢璇ョ姸鎬佸睍绀轰负鈥滃緟浜哄伐瀹℃牳鈥濓紝涓嶈灞曠ず涓烘寮?approved 鎶ュ憡銆?

## 9. Trace Log Protocol

`trace_log` 涓瘡鏉¤褰曞ぇ鑷村寘鎷細

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

璇存槑锛?

- `duration_ms` 鏄彲閫夊瓧娈碉紝涓嶆槸姣忎釜褰撳墠 Agent 閮戒竴瀹氬啓鍏ャ€?
- `error` 姝ｅ父涓?`null`銆?
- `status` 甯歌鍊煎寘鎷?`success`銆乣rejected`銆乣failed`銆乣schema_failed`銆?

`trace_log` 瑕嗙洊锛?

- `ResearchAgent`
- `EvidenceAgent`
- `ProductAgent`
- `BusinessAgent`
- `RiskAgent`
- `QualityAgent`
- `StrategyAgent`
- `HumanReviewRequired`

鐢ㄩ€旓細

- 鍓嶇 Workflow 椤甸潰
- Agent Replay
- Debug
- 绛旇京灞曠ず

## 10. Frontend-facing Readonly APIs

褰撳墠 FastAPI 宸叉彁渚涗互涓嬪彧璇绘帴鍙ｏ紝渚?Agent 宸ヤ綔鍙板睍绀轰腑闂翠骇鐗╋細

```text
GET /api/analysis/{task_id}/evidence
GET /api/analysis/{task_id}/claims
GET /api/analysis/{task_id}/trace
GET /api/analysis/{task_id}/quality
GET /api/analysis/{task_id}/metrics
GET /api/analysis/{task_id}/risks
GET /api/analysis/{task_id}/artifacts
```

鎺ュ彛绾︽潫锛?

- 涓嶄細瑙﹀彂 workflow銆?
- 鍙鍙栧凡鏈?task state銆?
- `task_id` 涓嶅瓨鍦ㄨ繑鍥?404銆?
- 瀛楁缂哄け鏃惰繑鍥炵┖鏁扮粍鎴栫┖瀵硅薄銆?
- 鐢ㄤ簬鍓嶇 Agent 宸ヤ綔鍙板睍绀?evidence銆乧laims銆乼race銆乹uality銆乺isks 鍜屼骇鐗╂憳瑕併€?

瀹屾暣 API 璇存槑瑙?`docs/api.md`銆?

## 11. Design Principles

鏈郴缁熼伒寰互涓嬭璁″師鍒欙細

1. **Schema-first Agent communication**  
   Agent 涔嬮棿閫氳繃缁撴瀯鍖?state 鍜?Pydantic Schema 浼犻€掍俊鎭€?

2. **Evidence-grounded claims**  
   Product / Business claims 蹇呴』缁戝畾鐪熷疄瀛樺湪鐨?`evidence_ids`銆?

3. **No unsupported final report**  
   StrategyAgent 涓嶅厑璁哥敓鎴愭病鏈?claim/evidence 鏀拺鐨勬寮忕粨璁恒€?

4. **Quality rejection before strategy generation**  
   QualityAgent 鍏堝仛缁撴瀯鍖栬川妫€锛屽彧鏈?approved 鎵嶈繘鍏ユ寮?StrategyAgent 鎶ュ憡銆?

5. **Human review instead of force pass**  
   涓夋鑷姩淇澶辫触鍚庤繘鍏ヤ汉宸ュ鏍革紝涓嶅己鍒堕€氳繃銆?

6. **Backward compatibility during migration**  
   `backend/orchestration` owns DAG wiring and routing, while real implementations stay in `backend/app/agents`.

7. **Traceable and frontend-readable intermediate artifacts**  
   涓棿浜х墿閫氳繃鍙 API 鏆撮湶锛屼究浜庡墠绔睍绀恒€佽皟璇曞拰绛旇京璇存槑銆?

8. **Industry-config driven extensibility**  
   褰撳墠 Demo 鑱氱劍 `gaming_mouse`锛屼絾琛屼笟淇℃伅浠嶉€氳繃閰嶇疆椹卞姩锛屽悗缁彲浠ユ墿灞曞埌娉涚數绔炲璁俱€佹櫤鑳芥墜鏈恒€佽€虫満銆佹憚褰卞櫒鏉愮瓑鍦烘櫙銆?

褰撳墠绯荤粺涓嶆槸鏅€?LLM 鎶ュ憡鐢熸垚鍣紝鑰屾槸 evidence-grounded銆乻chema-validated銆乹uality-controlled 鐨勫 Agent 绔炲搧鍒嗘瀽宸ヤ綔娴併€?
