semantic-eef 标准同步包

把V2审计69个run和497条事件转成标准submission.json、固定列序CSV和events.json，保留原生结果与全部执行/证据定位。
看板已有组ID semantic 保持稳定，展示名 semantic-eef；未新增重复实验组。
看板旧空夹56改为63（含无后续重试）；掉落63改为62（剔除主动释放后的牙刷下落）。V2物理判定未再改动。
成功重夹为空夹后26、掉落后26；直接换手尝试7成功0，桌面尝试17成功16，其他支撑面尝试1成功0。
补视野采用实际执行阶段：同臂144、异臂70；用gap_id串联同一观察缺口。
动作预算与turn预算独立判断，遵循用户原始统计要求。总action上限缺失，两项action放弃指标null/unknown；turn上限原生max_decisions=100，可独立核查。协议§3.2“相关四项一律unknown”存在歧义，本包显式保留turn结果，未据action缺失将turn信息一并抹去。
协议事件类别覆盖不足的新指标归other，configuration.audit_auxiliary.event_annotations保留原分类、计数贡献、失败链、原语及完整区间。
三视角原始视频没有已知公开URL，标准media.url=null并提供sha256和bytes；本地完整报告保留原始视频与关键帧的相对引用。
协议§4.1将empty_retry称为空夹后重试，§3指标5又包含无重试空夹。本包以指标5口径为准；结果字段标明是否存在后续重试。
碰撞结构化证据为V2已审核视觉接触事件及执行区间，未提供接触传感器；未覆盖run标NA。

数字为确认下界；不得把不同事件类型简单相加为总失败次数。report.html引用相邻robodojo_audit_v2的视频和证据；标准包可独立导入，公开媒体URL为空。
