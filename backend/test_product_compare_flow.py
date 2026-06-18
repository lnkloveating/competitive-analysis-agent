"""产品对比模式数据链路测试：选中两款鼠标后，工作流应读取 JSON 规格、
生成基于硬参数的 product_matrix 与有据可依的 claims，且 QualityAgent 不应三次打回。

运行（从 backend 目录）：python test_product_compare_flow.py
"""

import os
import sys

# 离线运行：关闭所有 LLM 与 tracing，避免网络依赖。
os.environ.setdefault("ENABLE_LANGSMITH", "false")
for _agent in ("RESEARCH", "EVIDENCE", "PRODUCT", "BUSINESS", "RISK", "QUALITY", "STRATEGY"):
    os.environ[f"{_agent}_AGENT_USE_LLM"] = "0"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api.routes import AnalysisRequest, _build_initial_state
from orchestration.workflow import app as workflow_app


def _run(initial_state: dict) -> dict:
    final = dict(initial_state)
    for event in workflow_app.stream(initial_state, {"recursion_limit": 50}, stream_mode="updates"):
        for node_name, update in event.items():
            if isinstance(update, dict):
                final.update(update)
    return final


def _make_request() -> AnalysisRequest:
    return AnalysisRequest(
        industry_key="gaming_mouse",
        target_platform="G Pro X Superlight 2",
        competitors=["G Pro X Superlight 2", "Viper V3 Pro"],
        analysis_scene="电竞鼠标产品对比",
        target_user="电竞玩家",
        time_range="近12个月",
        focus_dimensions=[],
        selected_products=[
            {"id": "logitech-gpx-superlight-2", "model": "G Pro X Superlight 2", "brand": "Logitech", "category": "gaming_mouse"},
            {"id": "razer-viper-v3-pro", "model": "Viper V3 Pro", "brand": "Razer", "category": "gaming_mouse"},
        ],
    )


def test_initial_state_is_compare_mode():
    state = _build_initial_state(_make_request())
    assert state["product_compare_mode"] is True
    assert state["competitors"] == ["G Pro X Superlight 2", "Viper V3 Pro"], state["competitors"]
    # 2 产品 × (6 硬维度 + 2 软维度) = 16 条证据
    assert len(state["evidence_list"]) == 16, len(state["evidence_list"])
    platforms = {e["platform"] for e in state["evidence_list"]}
    assert platforms == {"G Pro X Superlight 2", "Viper V3 Pro"}, platforms
    pending = [e for e in state["evidence_list"] if e.get("pending_research")]
    assert len(pending) == 4, len(pending)  # 每个产品 2 个软维度
    assert len(state["product_facts"]) == 2
    return state


def test_compatible_with_legacy_entry():
    # 不带 selected_products 的旧入口应仍走原链路（非对比模式）。
    legacy = AnalysisRequest(
        industry_key="gaming_mouse",
        target_platform="罗技",
        competitors=["罗技", "雷蛇"],
        analysis_scene="电竞鼠标竞品分析",
        target_user="产品经理",
        time_range="近12个月",
        focus_dimensions=["性能参数"],
    )
    state = _build_initial_state(legacy)
    assert state["product_compare_mode"] is False
    assert state["evidence_list"] == []
    assert state["product_facts"] == []


def test_full_workflow_passes_quality():
    initial_state = _build_initial_state(_make_request())
    final = _run(initial_state)

    # 1) workflow 读到了两款产品的规格 -> product_matrix 非空，且按 model 分平台
    matrix = final.get("product_matrix", {})
    dims = matrix.get("dimensions", {})
    assert dims, "product_matrix 为空"
    sample_dim = dims.get("性能参数", {})
    assert "G Pro X Superlight 2" in sample_dim and "Viper V3 Pro" in sample_dim, list(sample_dim)

    # 2) claims 不为 0，且每条都有 evidence_ids 支撑
    claims = [c for c in final.get("claims", []) if isinstance(c, dict)]
    assert len(claims) > 0, "claims 为 0"
    for claim in claims:
        assert claim.get("evidence_ids"), f"claim 缺 evidence_ids: {claim.get('claim_id')}"

    # 3) 至少有基于硬参数的对比 claim（比较型）
    comparative = [c for c in claims if "对比：" in str(c.get("content", ""))]
    assert comparative, "没有生成硬参数对比 claim"

    # 4) 忠实性：无未支撑 claim（数值都落在证据里）
    assert final.get("unsupported_claim_ids", []) == [], final.get("unsupported_claim_ids")

    # 5) QualityAgent 不应因品牌覆盖/商业矩阵不足而打回
    quality = final.get("quality_result", {})
    assert quality.get("approved") is True, quality
    assert final.get("needs_human_review") is False
    checks = quality.get("checked_items", {})
    assert checks.get("all_competitors_covered") is True
    assert checks.get("all_dimensions_covered") is True
    assert checks.get("business_matrix_not_empty") is True  # 对比模式跳过

    # 6) 软性维度被标记为待补充，而不是失败
    pending = [e for e in final.get("evidence_list", []) if e.get("pending_research")]
    assert pending and all(e.get("data_status") == "pending_research" for e in pending)
    return final


ALL_TESTS = [
    test_initial_state_is_compare_mode,
    test_compatible_with_legacy_entry,
    test_full_workflow_passes_quality,
]


if __name__ == "__main__":
    for test in ALL_TESTS:
        test()
        print(f"  PASS  {test.__name__}")
    final = test_full_workflow_passes_quality()
    print(
        f"\n产品对比链路测试通过：claims={len([c for c in final.get('claims', []) if isinstance(c, dict)])}，"
        f"quality={final.get('quality_result', {}).get('status')}，"
        f"current_agent={final.get('current_agent')}"
    )
