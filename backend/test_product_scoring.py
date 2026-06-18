"""产品评分体系测试：评分真实化 + 与报告可信度分离。

运行（从 backend 目录）：python test_product_scoring.py
"""

import os
import sys

os.environ.setdefault("ENABLE_LANGSMITH", "false")
for _agent in ("RESEARCH", "EVIDENCE", "PRODUCT", "BUSINESS", "RISK", "QUALITY", "STRATEGY"):
    os.environ[f"{_agent}_AGENT_USE_LLM"] = "0"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services import product_catalog_service as catalog
from app.services import product_scoring_service as scoring


def _score(query: str) -> dict:
    product, _by, _val = catalog.resolve_product("gaming_mouse", query)
    return scoring.score_product(product)


def test_gpx2_and_viper_scores_differ():
    a = _score("GPX2")
    b = _score("Viper V3 Pro")
    assert a["overall_score"] != b["overall_score"], "GPX2 与 Viper 综合分不应相同"
    assert a["hardware_score"] != b["hardware_score"], "硬件分应不同"
    # Viper 更轻 + 8000Hz + 更高 DPI -> 硬件/综合更高
    assert b["hardware_score"] > a["hardware_score"], (a["hardware_score"], b["hardware_score"])


def test_no_two_distinct_products_share_overall():
    ids = ["GPX2", "Viper V3 Pro", "G502 X Plus", "EC2-C", "Model O 2 Wireless"]
    overalls = [_score(q)["overall_score"]["current_score"] for q in ids]
    assert len(set(overalls)) == len(overalls), f"不同产品综合分出现重复：{overalls}"


def test_current_vs_full_with_missing():
    s = _score("GPX2")
    cur = s["overall_score"]["current_score"]
    full = s["overall_score"]["full_score_with_missing_as_zero"]
    # 缺失维度按 0 计入后必然 <= 当前分
    assert full <= cur, (full, cur)
    assert s["sentiment_score"] is None and s["sentiment_status"] == "pending"
    assert s["pending_dimensions"], "应列出待采集维度"


def test_driverless_software_not_punished():
    # ZOWIE EC2-C 免驱：软件分应处于中等而非垫底
    s = _score("EC2-C")
    assert 65 <= s["software_score"] <= 85, s["software_score"]
    assert "免驱" in s["score_basis"]["software_score"]


def test_scoreboard_verdicts():
    pa = catalog.resolve_product("gaming_mouse", "GPX2")[0]
    pb = catalog.resolve_product("gaming_mouse", "Viper V3 Pro")[0]
    board = scoring.build_scoreboard([pa, pb])
    assert board["verdicts"]["strongest_overall"] == "Viper V3 Pro"
    assert board["verdicts"]["best_for"] == {}
    assert board["verdicts"]["pending_verification"]
    assert "握法适配" in board["verdicts"]["pending_verification"][0]
    # 新增专业维度都在
    a = scoring.score_product(pa)
    for key in ("grip_fit_score", "hand_fit_score", "game_type_fit_score", "click_system_score", "shape_confidence"):
        assert key in a, key
    assert a["grip_fit_score"] is None
    assert a["hand_fit_score"] is None
    assert a["game_type_fit_score"] is None
    assert board["identification"] and board["identification"][0]["mold_id"]


def test_superstrike_click_system_and_field_confidence():
    standard = _score("狗屁王2")
    superstrike = _score("朱雀")

    assert standard["click_system"]["type"] == "hybrid"
    assert superstrike["click_system"]["type"] == "haptic"
    assert superstrike["click_system_score"] > standard["click_system_score"]
    assert "长期可靠性" in superstrike["click_system"]["risk"]

    identity = superstrike["identity"]
    assert identity["field_confidence_summary"]["review_verified"]
    assert identity["field_confidence_summary"]["community_unverified"] == ["community_aliases"]


def test_dex_is_not_standard_gpx2_mold():
    standard = _score("狗屁王2")
    dex = _score("DEX")
    assert standard["identity"]["mold_id"] != dex["identity"]["mold_id"]
    assert dex["identity"]["variant_name"] == "DEX"
    assert dex["identity"]["shape"] != standard["identity"]["shape"]


def test_quality_score_separate_from_product_scores():
    """跑完整工作流：quality_score=90（报告可信度）与 product_scores（产品分）并存且不同含义。"""
    from api.routes import AnalysisRequest, _build_initial_state
    from orchestration.workflow import app as workflow_app

    req = AnalysisRequest(
        industry_key="gaming_mouse",
        target_platform="G Pro X Superlight 2",
        competitors=["G Pro X Superlight 2", "Viper V3 Pro"],
        analysis_scene="对比",
        target_user="玩家",
        time_range="近12个月",
        focus_dimensions=[],
        selected_products=[{"id": "logitech-gpx-superlight-2"}, {"id": "razer-viper-v3-pro"}],
    )
    state = _build_initial_state(req)
    final = dict(state)
    for event in workflow_app.stream(state, {"recursion_limit": 50}, stream_mode="updates"):
        for _node, update in event.items():
            if isinstance(update, dict):
                final.update(update)

    quality = final["quality_result"]
    assert quality.get("quality_score") == 90.0
    assert quality.get("score_type") == "report_credibility"

    final_report = final["final_report"]
    ps = final_report.get("product_scores", {})
    products = ps.get("products", [])
    assert len(products) == 2, "final_report 必须包含 product_scores"
    assert products[0]["overall_score"] != products[1]["overall_score"]
    # 产品分不等于报告可信度
    assert products[0]["overall_score"]["current_score"] != 90.0
    assert final_report.get("product_verdict_summary"), "应有产品导向结论"
    assert final_report.get("baseline_hardware_review", {}).get("not_final") is True
    transition = final_report.get("score_transition", {})
    assert transition.get("baseline", {}).get("label") == "基础硬件快评"
    assert transition.get("final", {}).get("label") == "Agent 最终建议"
    advice = final_report.get("agent_analysis_result", {})
    assert advice.get("agent_final_verdict", {}).get("recommended_product")
    assert advice.get("agent_contributions"), "应说明每个 Agent 对最终建议的贡献"
    assert final_report.get("report_type") == "agent_final_report"
    assert final_report.get("summary", {}).get("winner"), "顶部结论应给出推荐产品"
    flow = final_report.get("score_flow", {})
    assert flow.get("baseline_score", {}).get("label") == "基础硬件快评"
    assert flow.get("final_score", {}).get("label") == "Agent 最终综合评分"
    assert final_report.get("agent_contributions"), "报告顶层应有 Agent 贡献"
    assert final_report.get("fit_analysis", {}).get("best_for"), "应有适合人群/场景分析"
    status = final_report.get("evidence_status", {})
    assert status.get("local_catalog", {}).get("status") == "available"
    assert status.get("crawler_reviews", {}).get("status") == "pending"
    assert status.get("crawler_price", {}).get("status") == "pending"
    assert final_report.get("final_recommendation", {}).get("recommended_product")
    return final


ALL_TESTS = [
    test_gpx2_and_viper_scores_differ,
    test_no_two_distinct_products_share_overall,
    test_current_vs_full_with_missing,
    test_driverless_software_not_punished,
    test_scoreboard_verdicts,
    test_superstrike_click_system_and_field_confidence,
    test_dex_is_not_standard_gpx2_mold,
    test_quality_score_separate_from_product_scores,
]


if __name__ == "__main__":
    for test in ALL_TESTS:
        test()
        print(f"  PASS  {test.__name__}")
    print(f"\n产品评分体系测试全部通过（{len(ALL_TESTS)} 项）")
