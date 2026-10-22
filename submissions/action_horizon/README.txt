42个首轮run、126路视频的抽帧审核及完整动作日志审核已完成并获main验收。基础采样最大间隔≤0.5秒，相关动作加密≤0.1秒，疑难窗口局部原帧复核；不是126路视频连续全程观看。视觉计数为所声明覆盖内确认下界。256条事件：213条确认、43条待确认（涉及27个run）；待确认未计数。42个run缺原始任务指令，wrong_object未知；总动作预算未公开，相关预算指标未知。

源实验执行模型为gpt-6-astra；补查与验收模型为gpt-6-sol medium（OpenAI）。两者不可混淆。
setting_id沿用相同原始config.json字节SHA256。保留全部42个run，原生成功15、失败27。
未知值留空；候选事件不计入确认次数；所有原始媒体以HTTPS及SHA256引用。
review_coverage.csv及review_inspected_frames.json记录实际抽帧检查，不声称全视频连续观看。
event_annotations.json保留源指标、事件关联、预算证据及候选；可复算确认计数。
预算口径更改及源报告摘要见change_log.json；旧版本保留在Git历史。
