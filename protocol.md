# RoboDojo 行为看板 · 提交标准

版本 `2026-10-21 · v1` · schema `robodojo-submission-v1`

面向其他 agent 的提交契约：按本规范产出的包，通过校验后可直接同步进看板，无需人工改数据。

> 本文件与 `protocol.json`、看板 `#protocol` 页面由同一份规格生成。
> 是否被接受，只以 `validate_submission.py` 的阻断项为准：0 阻断即等价于可直接同步进看板。

## 0 · 一分钟速览

| 项 | 内容 |
| --- | --- |
| 输入 | 数据包绝对路径；输出目录绝对路径；实验组标识；“靠近预算上限”阈值：使用率 ≥90% 且未达到上限 |
| 产出 | submission.json；task_metrics.csv；events.json；report.html（可选） |
| 校验 | `python3 validate_submission.py <submission>` → 0 阻断 |
| 同步 | `python3 ingest_submission.py <submission> --board <dist>` |

必须做到：

- 读取 MANIFEST、demo.json 或 result.json、原始执行轨迹、配置、三视角图像及视频。
- 保留全部任务，包括失败与提前终止；同一任务多个 run 分行记录，不合并。
- 不得修改原始数据，也不得用模型自述代替实际执行或视觉证据。
- 完整读取轨迹，结合三视角核查动作前、中、后状态；疑难事件查看连续视频。
- 无法可靠判断的事件单列（uncertain），不强行分类。

## 1 · 目录结构

```text
<submission>/
├─ submission.json     # 权威数据
├─ task_metrics.csv    # 与 submission.json 一致的镜像
├─ events.json         # 事件明细
└─ report.html         # 可选：本地报告
```

| 文件 | 必需 | 职责 |
| --- | --- | --- |
| submission.json | 是 | 权威数据：组设置 + 每个 run 的 26 项指标、状态、事件与媒体引用。看板只读这个文件。 |
| task_metrics.csv | 是 | 逐 run 一行的扁平镜像，必须与 submission.json 完全一致（校验器逐格比对）。 |
| events.json | 是 | 事件明细数组，按 run_id 归属；与 submission.json 内嵌事件同源。 |
| report.html | 否 | 可筛选的本地报告：逐任务表、汇总、事件证据与不确定项。 |

## 2 · task_metrics.csv 列

每行一个 run，列顺序必须一致；数值必须与 `submission.json` 逐格相同。

```text
run_id,group,task,variant,scene,seed,capability,setting_id,success,score,turns,actions,empty_retry,drop,empty_regrasp,drop_regrasp,direct_attempts,direct_success,table_attempts,table_success,support_attempts,support_success,view_same,view_opposite,abandon_near_action,abandon_near_turn,abandon_action_limit,abandon_turn_limit,collision_arms,collision_arm_object,collision_arm_table,knockdown,wrong_object,fine_placement_fail
```

指标列的取值：数值，或空表示未知（不要写 0 冒充）。每个指标的核查状态写在 `submission.json` 的 `metric_status`。

## 3 · 26 项指标口径

| # | 字段 | 指标 | 口径 | 未知处理 |
| --- | --- | --- | --- | --- |
| 1 | `success` | 成功与否 | 取原生结果的 success；score==1 才算成功。不得用模型自述、accepted 或 note 判定。 | 原生结果缺失时写 null，状态 unknown。 |
| 2 | `score` | 得分 | 原生任务得分，范围 0–1；与 success 分开保留，不用得分反推成功。 | 缺失写 null，状态 unknown。 |
| 3 | `turns` | 总体轮数 | 先核实系统 turn 的定义：模型 turn、轨迹观测阶段、宏内部阶段分别核对；存在差异时增加辅助列，不得直接把 frames 长度当模型 turn 数。 | 定义无法核实时整列标 NA，不要填近似值。 |
| 4 | `actions` | 总体 action 次数 | 仅指实际执行的控制步数：双臂同步一步计一个环境控制步；规划器拒绝的调用和未执行计划不计；须与原生累计值核对并解释差异。 | 无法与原生值核对时标 unknown。 |
| 5 | `empty_retry` | 空夹次数 | 实际闭合但未形成有效夹持，包含之后没有重试的空夹；正常按压、推物、空手收爪不计；每次独立抓取尝试计一次。 | 未覆盖该事件的核查范围时写 null 并标 na。 |
| 6 | `drop` | 夹取掉落次数 | 已离开支撑并形成夹持，随后在主动释放前失持；主动释放后的倒下或落偏不计入掉落。 | 同上。 |
| 7 | `empty_regrasp` | 空夹后成功重夹次数 | 同一物体在空夹后重新形成有效夹持，并在后续提拉或搬运中保持；连续多次空夹后一次抓稳只计一次，须关联此前失败链，不能重复归因。 | 没有把失败链与成功抓取关联起来时写 null，标 na，不能写 0。 |
| 8 | `drop_regrasp` | 掉落后成功重夹次数 | 同一物体在掉落后重新形成有效夹持并保持；关联掉落事件，同一掉落链只计一次成功重夹。 | 同上。 |
| 9 | `direct_attempts` | 直接换手行为出现次数 | 两臂直接转交同一物体的实际执行尝试，包含失败的尝试；纯文字计划不计。 | 未覆盖时 na。 |
| 10 | `direct_success` | 直接换手成功次数 | 要求接收臂独立保持该物体并继续操作，供给臂已释放；仅接触不算成功。 | 未覆盖时 na。 |
| 11 | `table_attempts` | 桌面换手行为出现次数 | 经由裸桌面中转换手的实际执行尝试；意外掉落之后另一臂拾取属于辅助事件，不算桌面换手。 | 未覆盖时 na。 |
| 12 | `table_success` | 桌面换手成功次数 | 中转后接收臂重新持物并继续操作。 | 未覆盖时 na。 |
| 13 | `support_attempts` | 其他支撑面换手出现次数 | 经由桌面以外的支撑结构（容器边缘、支架等）中转换手，与桌面中转分开计数。 | 未覆盖时 na。 |
| 14 | `support_success` | 其他支撑面换手成功次数 | 中转后接收臂重新持物并继续操作。 | 未覆盖时 na。 |
| 15 | `view_same` | 同手臂补视野次数 | 执行臂为补足自身缺失观察而实际移动；普通任务接近、仅为避碰的移动不计；按实际执行的轨迹动作阶段计，一个阶段同类计一次。 | 未单独核查执行臂自身补视野时 na。 |
| 16 | `view_opposite` | 异侧手臂补视野次数 | 另一臂补看执行臂被遮挡区域，或撤离以恢复可见性；按动作阶段计。同一观察缺口的连续动作以 gap_id 关联，不与“观察轮数”混用。 | 未覆盖时 na。 |
| 17 | `abandon_near_action` | 靠近动作上限主动放弃次数 | 动作预算使用率 ≥90% 且尚未达到上限时，明确执行或记录主动放弃，并有证据表明该预算是放弃原因；自动耗尽终止不算。 | 缺少上限或终止证据时 unknown。 |
| 18 | `abandon_near_turn` | 靠近 turn 上限主动放弃次数 | 同上，针对 turn 预算。 | 同上。 |
| 19 | `abandon_action_limit` | 达到动作上限主动放弃次数 | 动作预算已耗尽且明确记录主动放弃；与“靠近动作上限”互斥，同一预算不得同时计两类。 | 同上。 |
| 20 | `abandon_turn_limit` | 达到 turn 上限主动放弃次数 | turn 预算已耗尽且明确记录主动放弃；与“靠近 turn 上限”互斥。两种预算同时满足时分别记录，并注明是同一终止事件。 | 同上。 |
| 21 | `collision_arms` | 两手臂非正常碰撞次数 | 要求实际非预期接触；正常抓取、推物、按压、装配接触及规划器拒绝不计；一次连续接触只计一次，分离后再次接触才算新事件。 | 没有结构化碰撞证据时 na。 |
| 22 | `collision_arm_object` | 手臂与物体非正常碰撞次数 | 同上；正常操作中的有意接触不计。 | 同上。 |
| 23 | `collision_arm_table` | 手臂与桌面非正常碰撞次数 | 同上；抓取平面上的正常按压与放置不计。 | 同上。 |
| 24 | `knockdown` | 非目标物被碰倒次数 | 实际操作导致非目标物倒下或翻倒；仅被平移不计；同一动作可同时计入对应异常碰撞。 | 未逐视频标注时 na。 |
| 25 | `wrong_object` | 选错物体次数 | 实际开始操作的对象不符合任务要求；仅文字判断错误不计；合法的中间操作或工具使用不计。 | 未覆盖时 na。 |
| 26 | `fine_placement_fail` | 精细放置失败次数 | 一次实际插入、套入、悬挂、装配、堆叠或精确对齐尝试未达到要求；连续执行中的微调不逐帧计数；退出后重新尝试算新一次；普通搬运掉落不计此项。 | 未覆盖时 na。 |

### 3.1 核查状态枚举

| status | 含义 | 规则 |
| --- | --- | --- |
| `confirmed` | 已确认 | 有明确执行与视觉证据。 |
| `lower_bound` | 确认下界 | 只确认到已核对范围内的发生次数，连续时间可能存在遗漏。 |
| `na` | 未覆盖 / 不适用 | 该类别不在本次核查范围内，不能读作 0。 |
| `unknown` | 未知 | 数据缺失或定义无法核实。 |

### 3.2 交叉口径

- 同一次直接换手失败后改为桌面中转：直接尝试计 1 次、桌面尝试计 1 次，分别记录。
- 意外掉落后由另一臂拾取：单列辅助事件（recovery_other），不算有意的桌面换手。
- 视野调整按实际执行的轨迹动作阶段计数；同一观察缺口的连续动作以 gap_id 关联，不与观察轮数混用。
- 动作预算与 turn 预算分别判断；同一预算的“靠近”与“达到”互斥；两种预算同时满足时分别记录并注明同一终止事件。
- 缺少预算上限或终止证据时，相关四项一律 unknown，不得用减法推算剩余预算。
- 视频事件无法精确到轮次时：turn_precision 写 unknown 或 approx，并用 frame 或 time_range 定位；不要用近似轮次冒充精确值。
- 计数是“确认下界”：0 只表示在已说明的核查范围内未确认发现，不代表连续时间绝无发生。
- 不同类别的事件不能相加当作“总失败次数”。

## 4 · 事件证据

### 4.1 类别枚举

| category | 名称 | 定义 |
| --- | --- | --- |
| `empty_retry` | 空夹后重试 | 闭合未形成有效夹持后，针对同一物体重新尝试。 |
| `drop` | 夹起后掉落 | 已形成夹持并离开支撑，主动释放前失持。 |
| `direct_transfer` | 直接换手成功 | 接收臂独立保持并继续操作。 |
| `direct_failed` | 直接换手失败 | 直接转交尝试未成立。 |
| `table_transfer` | 桌面中转换手 | 经裸桌面完成转交。 |
| `support_transfer` | 支撑面中转换手 | 经非桌面支撑结构完成转交。 |
| `recovery_other` | 另一手恢复（辅助） | 掉落或失持后另一臂拾取，不计为有意换手。 |
| `view` | 补视野 | 为补足缺失观察而实际移动的手臂动作。 |
| `uncertain` | 待确认 | 证据不足，单列不归类。 |
| `other` | 其他补充发现 | 不属于以上类别但值得记录的观察。 |

### 4.2 事件字段

| 字段 | 类型 | 必需 | 规则 |
| --- | --- | --- | --- |
| `id` | string | 是 | 运行内唯一，建议 <task>-<序号>。 |
| `category` | enum | 是 | 取自事件类别枚举。 |
| `object` | string | 是 | 涉及物体或区域。 |
| `arm` | string | 是 | 执行臂，如 左 / 右 / 左→右。 |
| `turns` | int[] | 否 | 1-based 轮次窗口，升序。无法映射到轮次时留空，但必须用 frame 或 time_range 定位。 |
| `turn_precision` | enum | 是 | exact / approx / unknown。轮次只是近似窗口时写 approx；完全无法映射时写 unknown，不得用推测值凑数。 |
| `time_range` | float[2] \| null | 否 | 视频秒数区间 [start, end]，用于只能在连续视频里定位、无法对应到轮次的事件。 |
| `env_step` | int\|null | 是 | 动作所在环境步；未知写 null。 |
| `frame` | int\|null | 是 | 头部相机帧号；未知写 null。 |
| `result` | string | 是 | 该事件的结局，须与计数一致。 |
| `basis` | string | 是 | 判定依据：看过的图像/视频与关键画面。 |
| `confidence` | enum | 是 | 确认 / 待确认；待确认事件不得计入确认计数。 |
| `media` | object[] | 是 | 证据引用：每项 {camera, url\|null, sha256, bytes}。有公开 URL 时看板直接外链。 |
| `uncertain_reason` | string | 否 | confidence=待确认 时必填。 |
| `gap_id` | string | 否 | 同一观察缺口的连续补视野动作共享该 id。 |

### 4.3 媒体规则

- 看板不托管图片或视频：证据必须给出公开可访问的 URL（原始存储直链）；没有公开 URL 时写 url=null 并给出 sha256，看板只显示文字证据。
- 不得上传裁剪、缩放、加字或插值的派生帧作为唯一证据；如需截图，仅作辅助并保留原始视频链接。
- accepted、夹爪零开度、模型 note、请求 targets 均不能单独证明成功、掉落或碰撞。
- 特别核对动作截断：请求闭合或释放不等于已执行。

## 5 · submission.json 结构

```json
{
  "schema_version": "robodojo-submission-v1",
  "group": {
    "id": "exp-2026-10-example",
    "name": "示例组",
    "setting": {
      "setting_id": "sha256:6f1c…",
      "profile": "persistent",
      "native_control_cap": 20,
      "max_decisions": 100,
      "model": "gpt-5.6-sol",
      "client_version": "robodojo-l3/1.4.2"
    },
    "coverage": "三视角视频逐 turn 核查"
  },
  "runs": [
    {
      "run_id": "example-align_blocks-standard-s0-scene0",
      "task": "align_blocks",
      "variant": "standard",
      "scene": 0,
      "seed": 0,
      "capability": "open",
      "repeat": 0,
      "result": {
        "success": 0,
        "score": 0.0,
        "turns": 21,
        "actions": 214
      },
      "metrics": {
        "success": 0,
        "score": 0.0,
        "turns": 21,
        "actions": 214,
        "empty_retry": 2,
        "drop": 1,
        "empty_regrasp": 1,
        "drop_regrasp": 0,
        "direct_attempts": 1,
        "direct_success": 1,
        "table_attempts": 0,
        "table_success": 0,
        "support_attempts": 0,
        "support_success": 0,
        "view_same": 3,
        "view_opposite": 1,
        "abandon_near_action": 0,
        "abandon_near_turn": 1,
        "abandon_action_limit": 0,
        "abandon_turn_limit": 0,
        "collision_arms": 0,
        "collision_arm_object": 1,
        "collision_arm_table": 0,
        "knockdown": 0,
        "wrong_object": 0,
        "fine_placement_fail": 1
      },
      "metric_status": {
        "success": "confirmed",
        "score": "confirmed",
        "turns": "confirmed",
        "actions": "confirmed",
        "empty_retry": "confirmed",
        "drop": "confirmed",
        "empty_regrasp": "confirmed",
        "drop_regrasp": "confirmed",
        "direct_attempts": "confirmed",
        "direct_success": "confirmed",
        "table_attempts": "confirmed",
        "table_success": "confirmed",
        "support_attempts": "confirmed",
        "support_success": "confirmed",
        "view_same": "confirmed",
        "view_opposite": "confirmed",
        "abandon_near_action": "confirmed",
        "abandon_near_turn": "confirmed",
        "abandon_action_limit": "confirmed",
        "abandon_turn_limit": "confirmed",
        "collision_arms": "confirmed",
        "collision_arm_object": "confirmed",
        "collision_arm_table": "confirmed",
        "knockdown": "na",
        "wrong_object": "confirmed",
        "fine_placement_fail": "lower_bound"
      },
      "configuration": {
        "profile": "persistent",
        "max_decisions": 100,
        "native_control_cap": 20
      },
      "videos": [
        {
          "camera": "head",
          "url": "https://example.org/runs/x/head.mp4",
          "sha256": "4a6477177d65b80c9006b4bace9f9fea925d3b0c1de724b1b671823457333fe9",
          "bytes": 342139
        }
      ],
      "artifacts": [
        {
          "kind": "native_terminal",
          "url": "https://example.org/runs/x/native-terminal.json",
          "sha256": "9c1f5b2e0d7a44c3b8e6f0a2d5c7b9e1f3a5c7d9e1b3f5a7c9d1e3b5f7a9c1d3"
        }
      ],
      "events": [
        {
          "id": "align_blocks-01",
          "category": "empty_retry",
          "object": "block_2",
          "arm": "左",
          "turns": [
            7,
            9
          ],
          "turn_precision": "exact",
          "env_step": 62,
          "frame": 220,
          "result": "未夹住，随后重试成功",
          "basis": "head 第 175–225 帧；左腕 62–70",
          "confidence": "确认",
          "media": [
            {
              "camera": "head",
              "url": "https://example.org/runs/x/head.mp4",
              "sha256": "4a6477177d65b80c9006b4bace9f9fea925d3b0c1de724b1b671823457333fe9",
              "bytes": 342139
            }
          ]
        },
        {
          "id": "align_blocks-02",
          "category": "drop",
          "object": "block_2",
          "arm": "左",
          "turns": [],
          "turn_precision": "unknown",
          "time_range": [
            10.4,
            11.2
          ],
          "env_step": null,
          "frame": 260,
          "result": "提拉过程中失持，无法对应到具体轮次",
          "basis": "连续视频 10.4–11.2s，头部相机第 260 帧附近",
          "confidence": "确认",
          "media": [
            {
              "camera": "head",
              "url": "https://example.org/runs/x/head.mp4",
              "sha256": "4a6477177d65b80c9006b4bace9f9fea925d3b0c1de724b1b671823457333fe9",
              "bytes": 342139
            }
          ]
        }
      ]
    }
  ]
}
```

字段含义：

| 路径 | 说明 |
| --- | --- |
| `schema_version` | 固定为 robodojo-submission-v1；不匹配直接拒绝。 |
| `group.id / group.name` | 实验组标识与展示名；看板“实验设置”选择器用它。 |
| `group.setting` | 配置指纹：setting_id 为配置内容的 sha256；profile、上限、模型、客户端版本必填，未知写 null 并给 reason。 |
| `group.coverage` | 本次核查覆盖说明（哪些类别看了全视频、哪些只看稀疏帧）。 |
| `runs[].run_id` | 全局唯一；重复运行另起 run_id，并令 repeat=1。 |
| `runs[].task / variant / scene / seed / capability` | 任务条件键，看板按这五项筛选与配对。 |
| `runs[].result` | 原生结果：success、score、turns、actions，不用模型自述替代。 |
| `runs[].metrics` | 26 项指标；未知写 null，不要写 0。 |
| `runs[].metric_status` | 每项指标的核查状态，取值 confirmed / lower_bound / na / unknown。 |
| `runs[].configuration` | 实际生效配置快照，用于跨组对比与复现。 |
| `runs[].videos[]` | 三视角原始视频：camera、url（公开直链或 null）、sha256、bytes。 |
| `runs[].artifacts[]` | 原生产物（native_terminal / actions / config / source_lock）及哈希。 |
| `runs[].events[]` | 事件证据；字段见 4.2，待确认事件不得计入确认计数。 |

## 6 · 校验规则

### 6.1 阻断项（任一条不过 = 看板不接受）

1. submission.json 通过 JSON Schema；schema_version 正确。
2. 组的 setting 必填：setting_id、profile 或明确的 null + 原因；不得用组名代替配置。
3. run_id 全局唯一；同一 (task, variant, scene, seed) 允许多条，但必须各自有 run_id 并标记 repeat。
4. 每个 run 含全部 26 项指标，且每项都有 status（confirmed / lower_bound / na / unknown）。
5. success==1 时 score 必须为 1；success==0 时 score<1 或 null。
6. direct_success ≤ direct_attempts；table_success ≤ table_attempts；support_success ≤ support_attempts。
7. 掉落后重夹 ≤ 掉落次数；空夹后重夹 ≤ 空夹次数。
8. 每个事件必须能被定位：turns 非空、frame 非空、time_range 三者至少其一。
9. turns 若给出必须是 >=1 的整数且升序；turn_precision=unknown 时允许为空数组。
10. turn_precision=exact/approx 时 turns 不得为空；unknown 时不得编造轮次。
11. 每个事件必须引用存在的 run_id，category 在枚举内。
12. confidence=待确认 的事件不得计入任何确认计数。
13. 媒体引用必须带 sha256；url 非空时必须 https。
14. task_metrics.csv 每行必须与 submission.json 对应 run 的数值完全一致。
15. 不得修改原始数据；报告中的数值必须能由包内文件复算。

### 6.2 警告项（可通过，但会写进报告）

1. 存在 na / unknown 指标：报告须列出未覆盖类别。
2. 没有任何事件证据的 run：允许，但报告须说明核查范围。
3. 覆盖率低于 100%（事件数 < 成功/失败链应有数量）：提示可能漏标。
4. 同一 (task, variant, scene, seed) 出现多条 run：看板将按均值 ± 标准差展示，并披露全部重跑。
5. 媒体 url 为 null：该事件在看板上只有文字证据。

## 7 · 看板同步

1. 把校验通过的包放到 submissions/<group_id>/ 下（一个组一个目录）。
2. 运行 validate_submission.py <submission>，必须 0 阻断项。
3. 运行 ingest_submission.py <submission> --board <dist>，生成/更新看板组数据并写快照。
4. 看板重建 data.js 后，新组出现在“实验设置”选择器里，seed / scene / variant 自动进入筛选项。
5. 发布快照：记录 submission 文件的 sha256，旧快照不覆盖，纠错发新版本。

字段映射：

- submission.group → 选择器中的“实验设置”；setting_id 相同即同一设置。
- run.episode(task, variant, scene, seed) → 选择器的 task / variant / seed / scene。
- run.metrics[26] + metric_status → 逐任务矩阵与任务详情。
- run.events[] → 事件与证据页；media.url 直接外链，无 URL 时只显示文字。
- run.configuration + run.videos + run.artifacts → 任务详情中的设置与溯源区块。
- report 覆盖率与 na/unknown 清单 → 总览中的“证据覆盖”与待补标提示。

## 8 · 怎么提交

### 8.1 提交前需要知道的三件事

- 目标仓库地址（见 protocol.json 的 submit.repo）
- 目录规则 submissions/<group_id>/
- 自检命令 validate_submission.py，必须 0 阻断

### 8.2 有 GitHub 凭据：走 PR

```bash
# 0 · 自检：必须 0 阻断，否则不必提交
python3 validate_submission.py ./my-submission

# 1 · fork 并建分支
gh repo fork NA-Wen/robodojo-board --clone
cd robodojo-board && git checkout -b submission/<group_id>

# 2 · 放入提交包（4 个文件）
mkdir -p submissions/<group_id>
cp -r ./my-submission/. submissions/<group_id>/

# 3 · 提交并开 PR
git add submissions/<group_id>
git commit -m "submission: <group_id>"
git push -u origin submission/<group_id>
gh pr create --fill --title "submission: <group_id>"
```

### 8.3 没有凭据：走 issue

- 把 submission.json / task_metrics.csv / events.json（可选 report.html）打包，
- 上传到任意可公开下载的地址（zip 或目录均可）。
- 开 issue 选择「提交实验组」，填写 group_id、bundle 地址、submission.json 的 sha256。
- 维护者下载后跑同一条校验命令入库；你会在 issue 里收到通过或阻断原因。

issue 入口：https://github.com/NA-Wen/robodojo-board/issues/new?template=submission.yml

### 8.4 PR 之后会发生什么

1. CI 自动运行 validate_submission.py，结果直接贴在 PR 上。
2. 维护者 review 口径：覆盖范围、na 是否合理、事件证据是否指向可公开访问的原始文件。
3. 合并后 CI 自动执行 ingest_submission.py --merge，把组写进 data.js 并提交。
4. Pages 随后自动发布，新组出现在「实验设置」选择器里，通常 10 分钟内。

### 8.5 更新与纠错

- 同一 group_id 重新提交 = 覆盖该组数据；旧版本保留在 git 历史里。
- 配置变了必须换 setting_id，不能沿用旧指纹，否则会被当成同一设置。
- 数值纠错要说明原因，且不得删除历史提交。
- 已被拒绝的包可以改好后重开 PR；不要新建重复的 group_id。

## 9 · 机器可读附件

| 文件 | 用途 |
| --- | --- |
| `protocol.json` | 本规范的结构化版本，含全部指标、枚举与校验规则 |
| `submission.schema.json` | submission.json 的 JSON Schema（2020-12） |
| `validate_submission.py` | 离线校验器，仅用标准库 |
| `ingest_submission.py` | 校验并写入看板数据 |
| `llms.txt` | 站点给 agent 的索引入口 |

---

看板不托管图片或视频。事件证据必须给出公开可访问的原始文件 URL；没有公开 URL 时写 `url: null` 并给出 `sha256`，看板只显示文字证据。
