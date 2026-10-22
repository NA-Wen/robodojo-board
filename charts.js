/* Homepage charts share the exact selected runs used by the task and event pages. */
window.renderBehaviorOverview = function ({runs, groups, escape: esc, settings}) {
  const active = groups.filter(g => runs.some(r => r.g.id === g.id));
  const PAL=['#14654e','#b1773d','#4a5c8f','#8a6a86','#6f8a4a'];
  const colors = {semantic:PAL[0], persistent:PAL[1]};
  const series = active.map(g => ({...g, runs:runs.filter(r => r.g.id === g.id), color:colors[g.id] || PAL[active.indexOf(g)%PAL.length]}));
  const num = (v, decimals=0) => v.toLocaleString('en-US',{maximumFractionDigits:decimals,minimumFractionDigits:decimals});
  const label = g => `<span class="bc-legend"><i style="background:${g.color}"></i>${esc(g.name)}</span>`;
  const valueOf = (r,key) => key==='viewMotions' ? (r.c.counts.view_motions ?? null) : key==='viewOppositeStages' ? (r.c.submission_version?r.c.metrics.viewOpposite:(r.c.counts.view_motions??null)) : key==='viewEpisodes' ? (r.c.counts.view_episodes??r.c.metrics.viewOpposite??null) : r.c.metrics[key];
  const stats = (g,key,mode='sum') => {
    const vs=g.runs.map(r=>valueOf(r,key)).filter(v=>v!=null);
    if (!vs.length) return {value:null, known:0,total:g.runs.length};
    const v=mode==='incidence'?100*vs.filter(v=>v>0).length/vs.length:vs.reduce((a,b)=>a+b,0)/(mode==='mean'?vs.length:1);
    return {value:v,known:vs.length,total:g.runs.length,affected:vs.filter(v=>v>0).length};
  };
  function axisMax(value) {
    if(value<=1)return 1;
    const scale=10**Math.floor(Math.log10(value));
    return [1,2,4,5,8,10].map(x=>x*scale).find(x=>x>=value) || 10*scale;
  }
  function cardHead(title,subtitle,unit){return `<header class="bc-card-head"><div><h3>${title}</h3><p>${subtitle}</p></div><span class="bc-unit">${unit}</span></header>`}
  function bars(title,subtitle,rows,{unit='次',mode='sum',fixed=null,note='',decimals=0}={}) {
    const all=rows.map(([key,name,category])=>({key,name,category,values:series.map(g=>({g,...stats(g,key,mode)}))}));
    const known=all.flatMap(x=>x.values).filter(x=>x.value!==null);
    const max=fixed ?? axisMax(Math.max(1,...known.map(x=>x.value)));
    const axis=known.length?`<div class="bc-axis" aria-hidden="true"><span>0</span><span>${num(max/2,Number.isInteger(max/2)?0:1)}</span><span>${num(max)}</span></div>`:'';
    const content=all.map(row=>`<div class="bc-measure" data-measure="${row.key}"><div class="bc-measure-label">${row.name}</div>${row.values.map(x=>{
      const {g,value,known,total,affected}=x;
      if(value===null) return `<div class="bc-pending-line">${label(g)}<span>${g.audit_completion==='pending'?'待审核':'待补标'} <small>· ${total} 条运行</small></span></div>`;
      const suffix=mode==='incidence'?` · ${affected}/${known} 条运行`:` · ${known}/${total} 条运行有记录`;
      const action=row.category ? `data-chart-category="${row.category}" data-chart-experiment="${g.id}"` : '';
      const Tag=row.category?'button':'div';
      return `<${Tag} class="bc-series" ${action} data-chart-value="${value}" data-chart-key="${row.key}" data-chart-group="${g.id}" aria-label="${esc(g.name)}，${row.name}，${num(value,decimals)}${unit}${suffix}"><span class="bc-series-name">${label(g)}</span><span class="bc-track" aria-hidden="true"><span style="width:${Math.min(100,value/max*100)}%;background:${g.color}"></span></span><span class="bc-number" style="color:${g.color}">${num(value,decimals)}<small>${unit}</small></span>${mode==='incidence'?`<span class="bc-denom">${affected}/${known} 条运行</span>`:''}</${Tag}>`;
    }).join('')}</div>`).join('');
    return `<article class="bc-card ${known.length?'':'bc-card-pending'}">${cardHead(title,subtitle,known.length?unit:'待补标')}${axis}<div class="bc-plot">${content}</div><p class="bc-footnote">${note || (known.length?'柱形从 0 起，同图共用刻度；数值按当前筛选计算。':'当前无完整标注，暂不绘制数值；此状态不表示未发生。')}</p></article>`;
  }
  function outcome() {
    return `<article class="bc-card">${cardHead('完全成功率','原生 success 为 1 的运行 / 当前运行数','%')}<div class="bc-rings">${series.map(g=>{
      const total=g.runs.length,n=g.runs.filter(r=>r.c.metrics.success===1).length,pct=n/total*100;
      return `<div class="bc-ring-item">${label(g)}<div class="bc-ring" role="img" aria-label="${esc(g.name)}：${n}/${total}，成功率 ${pct.toFixed(1)}%"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bc-ring-bg" cx="60" cy="60" r="49"/><circle cx="60" cy="60" r="49" pathLength="100" stroke="${g.color}" stroke-dasharray="${pct} 100" transform="rotate(-90 60 60)"/></svg><b>${pct.toFixed(1)}<small>%</small></b></div><span class="bc-ring-count"><strong>${n}</strong> / ${total} 条运行成功</span></div>`;
    }).join('')}</div><p class="bc-footnote">分母随筛选变化；部分完成不纳入完全成功。</p></article>`;
  }

  // ── 分布图 1：某个指标的次数按 task 拆分（按组堆叠） ──
  function distribution(title,subtitle,key,{top=10,unit='次',note=''}={}) {
    const byTask=new Map();
    for(const g of series){
      for(const r of g.runs){
        const t=r.c.task;
        if(!byTask.has(t)) byTask.set(t,{total:0,parts:{},runs:{},pending:{}});
        const row=byTask.get(t);
        row.runs[g.id]=(row.runs[g.id]||0)+1;
        const v=valueOf(r,key);
        if(v==null){ row.pending[g.id]=(row.pending[g.id]||0)+1; continue; }
        row.parts[g.id]=(row.parts[g.id]||0)+v;
        row.total+=v;
      }
    }
    const sorted=[...byTask.entries()].filter(([,r])=>r.total>0).sort((a,b)=>b[1].total-a[1].total);
    if(!sorted.length) return `<article class="bc-card bc-card-pending">${cardHead(title,subtitle,'待补标')}<p class="bc-footnote">当前范围内没有可用的确认次数；此状态不表示未发生。</p></article>`;
    const shown=sorted.slice(0,top), rest=sorted.slice(top);
    const max=Math.max(...shown.map(([,r])=>r.total),1);
    const seg=(parts)=>series.filter(g=>(parts[g.id]||0)>0).map(g=>`<i style="width:${parts[g.id]/max*100}%;background:${g.color}" title="${esc(g.name)} · ${num(parts[g.id])}${unit}"></i>`).join('');
    const meta=(row)=>`${Object.values(row.runs).reduce((a,b)=>a+b,0)} 条运行`;
    const rowsHtml=shown.map(([t,row])=>`<div class="bc-dist-row"><span class="bc-dist-label" title="${esc(t)}">${esc(t)}</span><span class="bc-dist-track" aria-hidden="true">${seg(row.parts)}</span><span class="bc-dist-total">${num(row.total)}<small>${unit}</small></span><span class="bc-dist-meta">${esc(meta(row))}</span></div>`).join('');
    const restParts={};rest.forEach(([,r])=>series.forEach(g=>{if(r.parts[g.id])restParts[g.id]=(restParts[g.id]||0)+r.parts[g.id]}));
    const restTotal=rest.reduce((a,[,r])=>a+r.total,0);
    const restRow=rest.length?`<div class="bc-dist-row bc-dist-rest"><span class="bc-dist-label">其他 ${rest.length} 个任务</span><span class="bc-dist-track" aria-hidden="true">${seg(restParts)}</span><span class="bc-dist-total">${num(restTotal)}<small>${unit}</small></span><span class="bc-dist-meta">合计</span></div>`:'';
    return `<article class="bc-card">${cardHead(title,subtitle,unit)}<div class="bc-dist">${rowsHtml}${restRow}</div><p class="bc-footnote">${note || `只列出有确认次数的 task，按合计降序取前 ${shown.length} 个；柱长为组内堆叠，长度按同一刻度。悬停可看每组数值。`}</p></article>`;
  }

  // ── 分布图 2：事件发生在一次运行的第几轮（热力图，按组归一化） ──
  function positions(title,subtitle,cats,{note=''}={}) {
    const BUCKETS=['前 20%','20–40%','40–60%','60–80%','后 20%'];
    const rows=series.map(g=>{
      if(g.audit_completion==='pending') return {g,pending:true};
      const acc=[0,0,0,0,0]; let total=0,pos=0;
      for(const r of g.runs){
        const T=r.c.metrics.turns;
        for(const e of (r.c.events||[])){
          if(!cats.includes(e.category)) continue;
          total++;
          if(!T||!Array.isArray(e.turns)||!e.turns.length) continue;
          pos++;
          acc[Math.min(4,Math.max(0,Math.floor(Math.min(...e.turns)/T*5)))]++;
        }
      }
      return {g,acc,total,pos};
    });
    const usable=rows.filter(r=>!r.pending&&r.pos>0);
    if(!usable.length) return `<article class="bc-card bc-card-pending">${cardHead(title,subtitle,'—')}<p class="bc-footnote">当前范围内没有可定位轮次的事件。</p></article>`;
    const tint=(color,a)=>color+Math.round(Math.min(.9,Math.max(.05,a))*255).toString(16).padStart(2,'0');
    const head=`<div class="bc-heat-row bc-heat-head"><span>实验</span>${BUCKETS.map(b=>`<span>${b}</span>`).join('')}<span>可定位</span></div>`;
    const body=rows.map(r=>{
      if(r.pending) return `<div class="bc-heat-row bc-heat-pending"><span class="bc-heat-name">${label(r.g)}</span><span class="bc-heat-span">待审核，暂不计入</span></div>`;
      const cov=r.pos/r.total;
      const cells=r.pos?BUCKETS.map((b,i)=>{
        const pct=r.acc[i]/r.pos*100;
        return `<span class="bc-heat-cell" style="background:${tint(r.g.color,pct/100)};color:${pct>55?'#fff':'var(--ink)'}" title="${esc(r.g.name)} · ${b} · ${pct.toFixed(1)}%（${r.acc[i]}/${r.pos} 个事件）">${pct<0.5?'·':pct.toFixed(0)+'%'}</span>`;
      }).join(''):BUCKETS.map(()=>`<span class="bc-heat-cell bc-heat-na" title="${esc(r.g.name)}：这批事件只有帧号与时间范围，没有可用轮次">—</span>`).join('');
      const warn=cov<0.5?' bc-heat-warn':'';
      return `<div class="bc-heat-row"><span class="bc-heat-name">${label(r.g)}</span>${cells}<span class="bc-heat-cov${warn}" title="能定位到轮次的事件占比">${r.pos}/${r.total}${cov<0.5?' ⚠':''}</span></div>`;
    }).join('');
    return `<article class="bc-card bc-card-wide">${cardHead(title,subtitle,'%')}<div class="bc-heat" role="table" aria-label="${esc(title)}">${head}${body}</div><p class="bc-footnote">${note || '每行按该组自身事件数归一化，便于在总量不同的组之间比较；单元格为该区间占可定位事件的比例，颜色深浅同步表示比例。'}</p></article>`;
  }

  const sections=[
    {id:'general',name:'总体表现',en:'GENERAL',desc:'先看任务结果与执行成本',cards:[
      outcome(),
      bars('平均得分','原生分数的算术平均，不合成行为总分',[['score','任务得分']],{mode:'mean',unit:'分',fixed:1,decimals:2,note:'当前任务等权；只有任务构成一致时，组间均值才便于比较。'}),
      bars('平均执行成本','分别计算每条运行的成本', [['turns','运行轮数']],{mode:'mean',unit:'轮',decimals:1,note:'semantic-eef使用已核对的原生模型决策轮；其他组按各自来源口径，详见实验配置与覆盖说明。'}),
      bars('平均 action 次数','每条运行实际执行的控制步数',[['actions','实际控制步']],{mode:'mean',unit:'步',decimals:1,note:'包含成功和未成功运行；较少步骤也可能来自提前结束。'})
    ]},
    {id:'grasp',name:'夹取',en:'GRASP',desc:'抓取失败、恢复与目标选择',cards:[
      bars('空夹与掉落','已确认事件；点击柱形查看该实验的事件', [['emptyRetry','已记录空夹','empty_retry'],['drops','夹起后掉落','drop']],{note:'semantic-eef空夹包含最终未重试的独立尝试，掉落仅主动释放前失持；其他组口径见各组说明。'}),
      distribution('空夹集中在哪些任务','按 task 汇总已确认空夹次数，柱内按实验堆叠','emptyRetry',{top:10,note:'只列出有确认空夹的 task，按合计降序取前 10 个，其余合并为一行。semantic-eef 正在等待完整复核，不计入。'}),
      bars('涉及运行比例','至少发生过一次该事件的运行占比',[['emptyRetry','已记录空夹','empty_retry'],['drops','夹起后掉落','drop']],{mode:'incidence',unit:'%',fixed:100,decimals:1,note:'分母为有记录的运行数，不是抓取尝试数；不是抓取失败率。'}),
      bars('成功重夹与目标选择','需要关联失败事件和后续成功抓取',[['emptyRegrasp','空夹后成功重夹'],['dropRegrasp','掉落后成功重夹'],['wrongObject','选错物体']]),
      positions('失败发生在第几轮','事件首次出现位置 ÷ 该 run 总轮数，按组归一化',['empty_retry','drop'],{note:'靠近 0% 表示刚上手就失败，靠近 100% 表示接近预算耗尽才失败。“可定位”列表示这批事件里有多少条带可用轮次；action_horizon 的抽帧审核只有帧号与时间范围，因此无法定位，标为 —。'})
    ]},
    {id:'place',name:'放置',en:'PLACE',desc:'精细放置单独统计，与持物搬运中的掉落分开',cards:[
      bars('精细放置失败次数','插入、悬挂、对齐等操作未达目标',[['finePlacementFail','精细放置失败']]),
      bars('涉及运行比例','至少发生一次精细放置失败的运行',[['finePlacementFail','精细放置失败']],{mode:'incidence',unit:'%',fixed:100,note:'需要完成逐运行标注后才能计算；不是放置尝试失败率。'})
    ]},
    {id:'handoff',name:'换手',en:'HANDOFF',desc:'直接、桌面、其他支撑面分别展示',cards:[
      bars('直接换手','出现次数与成功次数分别呈现',[['directAttempts','出现次数'],['directSuccess','成功次数','direct_transfer']],{note:'实际执行的直接换手尝试包含失败；成功要求接收臂独立保持并继续操作。'}),
      bars('桌面换手','实际尝试与确认成功分别记录',[['tableAttempts','已记录出现次数'],['tableSuccess','确认成功次数','table_transfer']],{note:'失败尝试尚未完整补标，出现次数为下限；不据此计算成功率。'}),
      bars('其他支撑面换手','支撑架、垫面等中转',[['supportAttempts','已记录出现次数'],['supportSuccess','确认成功次数','support_transfer']],{note:'失败尝试尚未完整补标，出现次数为下限；不据此计算成功率。'}),
      bars('掉落后异手恢复','单列辅助事件，保留实际支撑面',[['recoveryOther','另一手重新拾取','recovery_other']],{note:'不并入有意换手。semantic-eef 全批次：桌面 2 次、传送带 2 次；筛选后以当前事件为准。'})
    ]},
    {id:'view',name:'换视角',en:'VIEWPOINT',desc:'区分执行臂自身取景与异侧机械臂补充观察',cards:[
      bars('补视野动作数','按实际执行的轨迹动作阶段计数',[['viewSame','同手臂调整'],['viewOppositeStages','异侧手臂调整','view']],{unit:'次',note:'semantic-eef同臂与异侧均按实际执行阶段计数，同一缺口通过 gap_id 关联；历史组保留原审核动作口径。'}),
      bars('异侧观察缺口数（辅助）','同一观察缺口通过 gap_id 关联',[['viewEpisodes','观察缺口','view']],{unit:'个',note:'一次观察缺口可包含多个实际动作；此辅助数不属于26项动作阶段指标，不能与动作次数相加。'})
    ]},
    {id:'abandon',name:'放弃',en:'ABANDON',desc:'主动停止与系统强制结束需要分别判定',cards:[
      bars('靠近上限时主动放弃','阈值为使用率≥90%且未达到上限',[['abandonNearAction','靠近动作上限'],['abandonNearTurn','靠近 turn 上限']],{note:'预算处理见各组说明。semantic-eef依用户口径独立判断动作与turn预算：总动作预算缺失为unknown，原生turn上限100可单独核查。'}),
      bars('达到上限时主动放弃','需要排除被系统强制结束的运行',[['abandonActionLimit','达到动作上限'],['abandonTurnLimit','达到 turn 上限']])
    ]},
    {id:'collision',name:'碰撞与扰动',en:'COLLISION',desc:'区分非正常接触与对非目标物的影响',cards:[
      bars('异常碰撞次数','正常抓取接触、任务要求的推碰不计',[['collisionArms','两手臂之间'],['collisionArmObject','手臂与物体'],['collisionArmTable','手臂与桌面']]),
      bars('非目标物被碰倒','目标操作过程中对其他物体的扰动',[['knockdown','非目标物被碰倒']])
    ]}
  ];
  const episodes=new Map();for(const r of runs){const k=JSON.stringify([r.c.task,r.c.episode.variant,r.c.episode.seed,r.c.episode.scene]);if(!episodes.has(k))episodes.set(k,[]);episodes.get(k).push(r)}
  const matched=active.length>1?[...episodes.values()].filter(rs=>active.every(g=>rs.filter(r=>r.g.id===g.id).length===1)).length:0;
  const uncertainty=runs.reduce((n,r)=>n+(r.c.metrics.uncertain||0),0);
  const semanticRuns=runs.filter(r=>r.g.id==='semantic'&&r.c.audit_source);
  const source=semanticRuns.length?groups.find(g=>g.id==='semantic').audit_source:null;
  const sourcePanel=source?`<div class="bc-source"><div><b>semantic-eef · 69 case 审核已接入</b><p>当前选中 ${semanticRuns.length} 条 · 动作记录与关键帧核查，非全视频逐帧审核</p></div><a class="button" href="${esc(source.report_url)}" target="_blank" rel="noopener">完整报告与证据 ↗</a><a class="button" href="${esc(source.counts_url)}" target="_blank" rel="noopener">统计表 ↗</a><a class="button" href="${esc(source.bundle_url)}" download>完整打包 ↓</a></div>`:'';
  const semantic=active.find(g=>g.id==='semantic'&&g.submission_links);
  const semanticPanel=semantic?`<div class="bc-source"><div><b>semantic-eef · ${semantic.audit_completion==='pending'?'阶段性结果：完整审核未完成':'26项标准包已同步'}</b><p>${semantic.audit_completion==='pending'?'69个run / 207路视频全程观看待审核 · 旧版497条事件保留，不作为最终计数':'69个run · 497条事件 · †为确认下界'}</p></div><a class="button" href="${esc(semantic.submission_links.csv)}">标准CSV</a><a class="button" href="${esc(semantic.submission_links.bundle)}">submission.json</a><a class="button" href="${esc(semantic.submission_links.events)}">events.json</a><a class="button" href="${esc(semantic.submission_links.validation)}">校验记录</a>${semantic.submission_links.coverage?`<a class="button" href="${esc(semantic.submission_links.coverage)}">观看覆盖记录</a>`:''}</div>`:'';
  const persistent=active.find(g=>g.id==='persistent'&&g.submission_links);
  const persistentPanel=persistent?`<div class="bc-source"><div><b>persistent-cap20 · 26项标准包已更新</b><p>42个run · 292条事件 · 0阻断 · 靠近action确认5次、turn确认4次（各3任务未知） · †为确认下界</p></div><a class="button" href="${esc(persistent.submission_links.budget_review)}">预算复核</a><a class="button" href="${esc(persistent.submission_links.xlsx)}">Excel</a><a class="button" href="${esc(persistent.submission_links.csv)}">标准CSV</a><a class="button" href="${esc(persistent.submission_links.bundle)}">submission.json</a><a class="button" href="${esc(persistent.submission_links.validation)}">校验记录</a></div>`:'';
  const scope=series.map(g=>`${g.name} ${g.runs.length} 条运行`).join(' / ');
  return `<div class="bc-intro"><div><p class="eyebrow">BEHAVIOR OVERVIEW</p><h1>从总体结果，到每一类行为</h1><p class="subtitle">${esc(scope)} · 所有图表随上方筛选联动</p></div><button class="button" id="export-scope">导出当前范围 JSON ↓</button></div>
    <div class="bc-toolbar"><div class="bc-global-legend">${series.map(label).join('')}</div><span>颜色固定代表实验，不表示好坏</span></div>
    <nav class="bc-section-nav" aria-label="行为分区">${sections.map((s,i)=>`<button data-chart-section="${s.id}"><small>${String(i).padStart(2,'0')}</small>${s.name}</button>`).join('')}</nav>
    ${sourcePanel}${semanticPanel}${persistentPanel}<div class="notice bc-notice">${active.length>1?`当前范围有 ${matched} 组相同 task / variant / seed / scene 可配对。各组任务构成、实验设置与证据覆盖不同，汇总值仅描述各自样本。`:'当前为单实验范围，图表描述所选样本。'} 事件数为确认下限；“待补标”不等于 0。${uncertainty?` 当前 ${uncertainty} 条事件待确认，未并入相应确认计数。`:''}${semanticRuns.length?' semantic-eef 的 3 次空夹/掉落待定事件只归入其中一类，不可双计；主动释放后落下已从掉落计数中排除。':''}</div>
    ${sections.map((s,i)=>`<section class="bc-section" id="behavior-${s.id}" aria-labelledby="behavior-title-${s.id}"><header class="bc-section-head"><span class="bc-section-number">${String(i).padStart(2,'0')}</span><div><p>${s.en}</p><h2 id="behavior-title-${s.id}">${s.name}</h2></div><span class="bc-section-description">${s.desc}</span></header><div class="bc-grid ${s.cards.length===4?'bc-grid-general':s.cards.length===3?'bc-grid-three':''}">${s.cards.join('')}</div></section>`).join('')}
    <details class="bc-config"><summary>查看实验配置与证据覆盖</summary><div class="settings-grid">${settings}</div></details>
    <div class="bc-bottom"><span>需要查看每个 task 的具体数值？</span><a class="button" data-page="cases" href="#cases">查看全部逐任务指标 →</a></div>`;
};
