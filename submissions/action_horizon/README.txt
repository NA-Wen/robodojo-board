action_horizon · 阶段性审查 / 预算自述口径

本次更新42个首轮run；不运行模型/模拟器、不改原始数据、不托管媒体。
原生成功15/失败27，模型决策2727，控制步25032。20次give_up各有1个原生控制步。
预算四项168格均有整数：动作剩余不足6、turn剩余不足3、明确动作耗尽0、明确turn耗尽0。build_tower同一终止分别归因两类预算，不加总为独立失败次数。4次泛称预算不足单列。
用户明确授权这四项参照模型自述；这是protocol预算判定的显式口径例外。remaining不足代理靠近，未验证≥90%；motion/motion-call/remaining steps映射动作是自述编码，不证明真实控制步预算。0=未明确自述该类别，不是实际未发生。confirmed仅表示自述编码核对完成。
全部126路视频尚未完成连续全程观看；静态帧核查不冒充完整观看。7个视觉指标单元有局部确认下界，其余749个视觉指标单元pending。41条事件包含5条局部确认视觉事件、16条待核实线索、20条原生give_up记录。
预算原文及编码规则见budget_self_report.csv、budget_self_report_policy.json和configuration.audit_auxiliary。真实帧号可定位，视觉事件无官方env/turn映射，因此turns=[]、turn_precision=unknown，env_step=null。
保留全部run、原视频https直链及哈希；report.html可筛选。校验通过仅表示可入库，不表示完整审核完成。
