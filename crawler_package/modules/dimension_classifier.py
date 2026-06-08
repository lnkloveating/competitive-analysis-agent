from typing import Dict, List


class DimensionClassifier:
    def __init__(self):
        self.keyword_map: Dict[str, Dict[str, List[str]]] = {
            "gaming_mouse": {
                "性能参数": ["传感器", "DPI", "回报率", "延迟", "响应", "追踪", "精度", "加速度"],
                "轻量化设计": ["重量", "轻量化", "减重", "外壳", "开孔", "手型", "握持", "重心"],
                "无线与续航": ["无线", "续航", "电池", "充电", "蓝牙", "2.4G", "续航时间", "续航时长"],
                "软件生态": ["驱动", "软件", "DPI设置", "宏", "按键映射", "固件更新", "云同步"],
                "用户口碑": ["用户评价", "用户体验", "手感", "品控", "缺点", "吐槽", "好评"],
                "价格定位": ["价格", "售价", "促销", "性价比", "首发价", "定价", "优惠"],
                "电竞品牌影响力": ["战队", "赛事", "职业选手", "主播", "赞助", "联名", "品牌"],
            },
            "gaming_keyboard": {
                "轴体手感": ["轴体", "青轴", "红轴", "茶轴", "黑轴", "手感", "触发键程", "压力克数"],
                "键帽材质": ["键帽", "PBT", "ABS", "耐磨", "打油", "字符", "高度"],
                "键位布局": ["布局", "配列", "87键", "104键", "60%", "65%", "键位"],
                "RGB灯效": ["RGB", "背光", "灯效", "灯光", "律动", "幻彩"],
                "热插拔能力": ["热插拔", "换轴", "插拔轴", "座子", "可换轴"],
                "续航表现": ["续航", "电池", "无线", "充电", "续航时间"],
                "电竞延迟表现": ["延迟", "响应速度", "低延迟", "回报率", "竞技"],
            },
            "gaming_headset": {
                "音频音质": ["音质", "声场", "解析力", "低频", "三频", "音频", "听声辨位"],
                "降噪能力": ["降噪", "主动降噪", "ANC", "隔音", "环境音"],
                "麦克风收音效果": ["麦克风", "麦", "收音", "通话", "语音", "通话质量"],
                "佩戴舒适度": ["佩戴", "头梁", "耳罩", "重量", "长时间戴", "夹头", "舒适度"],
                "无线延迟": ["无线", "延迟", "低延迟", "2.4G", "蓝牙", "游戏模式"],
                "续航时长": ["续航", "电池", "充电", "续航时间", "快充"],
                "头戴重量": ["重量", "轻量化", "头梁压力", "便携", "头戴重量"],
            }
        }

    def classify(self, industry_key: str, content: str) -> str:
        if not content or not content.strip():
            return "综合竞争情报"

        industry_key_norm = industry_key or "gaming_mouse"
        dimensions = self.keyword_map.get(industry_key_norm, {})

        if not dimensions:
            return "综合竞争情报"

        content_lower = content.lower()
        max_score = 0
        best_dimension = list(dimensions.keys())[0]

        for dimension, keywords in dimensions.items():
            score = 0
            for kw in keywords:
                if kw in content_lower:
                    score += 1
            if score > max_score:
                max_score = score
                best_dimension = dimension

        return best_dimension
