/* Homepage charts share the exact selected runs used by the task and event pages. */
window.renderBehaviorOverview = function ({runs, groups, escape: esc, settings}) {
  const active = groups.filter(g => runs.some(r => r.g.id === g.id));
  const PAL=['#58A165','#E68A36','#438FC4','#9474B5','#CF626D'];
  const colors = {semantic:PAL[0], persistent:PAL[1]};
  const series = active.map(g => ({...g, runs:runs.filter(r => r.g.id === g.id), color:colors[g.id] || PAL[active.indexOf(g)%PAL.length]}));
  const num = (v, decimals=0) => v.toLocaleString('en-US',{maximumFractionDigits:decimals,minimumFractionDigits:decimals});
  const label = g => `<span class="bc-legend"><i style="background:${g.color}"></i>${esc(g.name)}</span>`;
  const BIGTASKBARS=new Set(['score','emptyRetry','drops','turns','actions','finePlacementFail']);
  const valueOf = (r,key) => key==='actionsPerTurn' ? ((r.c.metrics.turns>0&&r.c.metrics.actions!=null)?r.c.metrics.actions/r.c.metrics.turns:null) : key==='viewMotions' ? (r.c.counts.view_motions ?? null) : key==='viewOppositeStages' ? (r.c.submission_version?r.c.metrics.viewOpposite:(r.c.counts.view_motions??null)) : key==='viewEpisodes' ? (r.c.counts.view_episodes??r.c.metrics.viewOpposite??null) : r.c.metrics[key];
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
    const autoMax=axisMax(Math.max(1,...known.map(x=>x.value)));
    const max=(fixed!=null && known.every(x=>x.value<=fixed))?fixed:autoMax;
    const axis=known.length?`<div class="bc-axis" aria-hidden="true"><span>0</span><span>${num(max/2,Number.isInteger(max/2)?0:1)}</span><span>${num(max)}</span></div>`:'';
    const content=all.map(row=>`<div class="bc-measure" data-measure="${row.key}"><div class="bc-measure-label">${row.name}</div>${row.values.map(x=>{
      const {g,value,known,total,affected}=x;
      if(value===null) return `<div class="bc-pending-line">${label(g)}<span>${g.audit_completion==='pending'?'待审核':'待补标'} <small>· ${total} 条运行</small></span></div>`;
      const suffix=mode==='incidence'?` · ${affected}/${known} 条运行`:` · ${known}/${total} 条运行有记录`;
      const action=row.category ? `data-chart-category="${row.category}" data-chart-experiment="${g.id}"` : '';
      const Tag=row.category?'button':'div';
      return `<${Tag} class="bc-series" ${action} data-chart-value="${value}" data-chart-key="${row.key}" data-chart-group="${g.id}" aria-label="${esc(g.name)}，${row.name}，${num(value,decimals)}${unit}${suffix}"><span class="bc-series-name">${label(g)}</span><span class="bc-track" aria-hidden="true"><span style="width:${Math.min(100,value/max*100)}%;background:${g.color}"></span></span><span class="bc-number" style="color:${g.color}">${num(value,decimals)}<small>${unit}</small></span>${mode==='incidence'?`<span class="bc-denom">${affected}/${known} 条运行</span>`:''}</${Tag}>`;
    }).join('')}</div>${mode==='incidence'?'':taskBars(row.key,{mode:mode==='mean'?'mean':'sum',unit,decimals})}`).join('');
    const wide=all.some(r=>BIGTASKBARS.has(r.key));
    const card=`<article class="bc-card ${wide?'bc-card-wide ':''}${known.length?'':'bc-card-pending'}">${cardHead(title,subtitle,known.length?unit:'待补标')}${axis}<div class="bc-plot">${content}</div><p class="bc-footnote">${note || (known.length?'柱形从 0 起，同图共用刻度；数值按当前筛选计算。':'当前无完整标注，暂不绘制数值；此状态不表示未发生。')}</p></article>`;
    return card;
  }

  // 纵向分组柱状图：横轴 task（全部画出，可横向滚动），纵轴数值，颜色=实验
  function taskBars(key,{mode='sum',unit='次',decimals=0}={}) {
    const byTask=new Map();
    for(const g of series) for(const r of g.runs){
      const t=r.c.task, v=valueOf(r,key);
      if(!byTask.has(t)) byTask.set(t,{sum:{},cnt:{}});
      const row=byTask.get(t);
      if(v==null) continue;
      row.sum[g.id]=(row.sum[g.id]||0)+v;
      row.cnt[g.id]=(row.cnt[g.id]||0)+1;
    }
    const val=(row,gid)=>mode==='mean'?(row.cnt[gid]?row.sum[gid]/row.cnt[gid]:null):(row.sum[gid]??null);
    const list=[...byTask.entries()].map(([t,row])=>({t,vals:series.map(g=>({g,v:val(row,g.id)})).filter(x=>x.v!=null)}))
      .filter(x=>x.vals.length);
    if(!list.length) return '';
    const agg=x=>mode==='mean'?x.vals.reduce((a,b)=>a+b.v,0)/x.vals.length:x.vals.reduce((a,b)=>a+b.v,0);
    list.forEach(x=>x.score=agg(x));
    list.sort((a,b)=>b.score-a.score);
    const used=series.filter(g=>list.some(x=>x.vals.some(v=>v.g.id===g.id)));
    const max=axisMax(Math.max(...list.flatMap(x=>x.vals.map(v=>v.v)),1e-9));
    const slot=Math.max(78,34+10*used.length);
    const PL=44,PR=10,PT=12,PB=18,H=210;
    const W=Math.round(PL+PR+slot*list.length);
    const bw=Math.min(16,(slot-8)/used.length);
    const y=v=>H-PB-(v/max)*(H-PT-PB);
    const ticks=[0,max/2,max];
    const grid=ticks.map(t=>`<line x1="${PL}" x2="${W-PR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="bc-sc-grid"/><text x="${PL-8}" y="${(y(t)+3.5).toFixed(1)}" text-anchor="end" class="bc-sc-tick">${num(t,decimals)}</text>`).join('');
    const bars=list.map((x,i)=>{
      const cx=PL+slot*i+slot/2;
      const start=cx-(bw*used.length)/2;
      return x.vals.map(v=>{
        const gi=used.findIndex(g=>g.id===v.g.id);
        return `<rect x="${(start+bw*gi).toFixed(1)}" y="${y(v.v).toFixed(1)}" width="${Math.max(1,bw-1.2).toFixed(1)}" height="${Math.max(0,(H-PB-y(v.v))).toFixed(1)}" rx="1.5" fill="${v.g.color}" fill-opacity=".9"><title>${esc(x.t)} · ${esc(v.g.name)} · ${num(v.v,decimals)}${unit}</title></rect>`;
      }).join('');
    }).join('');
    const legend=used.map(g=>`<span class="bc-legend"><i style="background:${g.color}"></i>${esc(g.name)}</span>`).join('');
    return `<div class="bc-tb">
      <div class="bc-tb-head"><span>按 task</span><small>${mode==='mean'?'组内均值':'合计'} · 单位 ${unit} · 共 ${list.length} 个任务，可横向滑动查看全部</small></div>
      <div class="bc-tb-scroll"><div class="bc-tb-inner" style="width:${W}px">
        <svg class="bc-bars" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="按 task 的分组柱状图">${grid}${bars}</svg>
        <div class="bc-xlab">${list.map(x=>`<span><b title="${esc(x.t)}">${esc(x.t.length>14?x.t.slice(0,13)+'…':x.t)}</b></span>`).join('')}</div>
      </div></div>
      <div class="bc-tb-legend">${legend}</div></div>`;
  }

  function outcome() {
    return `<article class="bc-card">${cardHead('完全成功率','原生 success 为 1 的运行 / 当前运行数','%')}<div class="bc-rings">${series.map(g=>{
      const total=g.runs.length,n=g.runs.filter(r=>r.c.metrics.success===1).length,pct=n/total*100;
      return `<div class="bc-ring-item">${label(g)}<div class="bc-ring" role="img" aria-label="${esc(g.name)}：${n}/${total}，成功率 ${pct.toFixed(1)}%"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bc-ring-bg" cx="60" cy="60" r="49"/><circle cx="60" cy="60" r="49" pathLength="100" stroke="${g.color}" stroke-dasharray="${pct} 100" transform="rotate(-90 60 60)"/></svg><b>${pct.toFixed(1)}<small>%</small></b></div><span class="bc-ring-count"><strong>${n}</strong> / ${total} 条运行成功</span></div>`;
    }).join('')}</div><p class="bc-footnote">分母随筛选变化；部分完成不纳入完全成功。</p></article>`;
  }

  // ── 分布图：任意指标按 task 拆分（计数=合计，均值=组内均值）──
  function distribution(title, subtitle, key, {mode='sum', unit='次', decimals=0, top=8, note=''}={}) {
    const byTask=new Map();
    for(const g of series){
      for(const r of g.runs){
        const t=r.c.task;
        if(!byTask.has(t)) byTask.set(t,{sum:{},cnt:{},runs:{},total:0});
        const row=byTask.get(t);
        row.runs[g.id]=(row.runs[g.id]||0)+1;
        const v=valueOf(r,key);
        if(v==null) continue;
        row.sum[g.id]=(row.sum[g.id]||0)+v;
        row.cnt[g.id]=(row.cnt[g.id]||0)+1;
        row.total+=v;
      }
    }
    const val=(row,gid)=>mode==='mean'? (row.cnt[gid]? row.sum[gid]/row.cnt[gid] : null) : (row.sum[gid]??null);
    const scored=[...byTask.entries()].map(([t,row])=>({t,row,vals:series.map(g=>({g,v:val(row,g.id)})).filter(x=>x.v!=null)}))
      .filter(x=>x.vals.length);
    if(!scored.length) return '';
    const agg=x=>mode==='mean'? x.vals.reduce((a,b)=>a+b.v,0)/x.vals.length : x.vals.reduce((a,b)=>a+b.v,0);
    scored.forEach(x=>x.score=agg(x));
    scored.sort((a,b)=>b.score-a.score);
    const shown=scored.slice(0,top), rest=scored.slice(top);
    const max=Math.max(...shown.map(x=>x.score),1e-9);
    const seg=(vals)=>vals.map(x=>`<i style="width:${x.v/max*100}%;background:${x.g.color}" title="${esc(x.g.name)} · ${num(x.v,decimals)}${unit}"></i>`).join('');
    const rows=shown.map(x=>`<div class="bc-dist-row"><span class="bc-dist-label" title="${esc(x.t)}">${esc(x.t)}</span><span class="bc-dist-track" aria-hidden="true">${seg(x.vals)}</span><span class="bc-dist-total">${num(x.score,decimals)}<small>${unit}</small></span><span class="bc-dist-meta">${Object.values(x.row.runs).reduce((a,b)=>a+b,0)} 条运行</span></div>`).join('');
    const restRow=rest.length?(()=>{
      const acc={};rest.forEach(x=>x.vals.forEach(({g,v})=>acc[g.id]=(acc[g.id]||0)+v));
      const vals=series.filter(g=>acc[g.id]!=null&&acc[g.id]>0).map(g=>({g,v:mode==='mean'?acc[g.id]/rest.length:acc[g.id]}));
      const tot=mode==='mean'? rest.reduce((a,x)=>a+x.score,0)/rest.length : Object.values(acc).reduce((a,b)=>a+b,0);
      return `<div class="bc-dist-row bc-dist-rest"><span class="bc-dist-label">其他 ${rest.length} 个任务</span><span class="bc-dist-track" aria-hidden="true">${seg(vals)}</span><span class="bc-dist-total">${num(tot,decimals)}<small>${unit}</small></span><span class="bc-dist-meta">${mode==='mean'?'均值':'合计'}</span></div>`;
    })():'';
    const unitLabel = mode==='mean'? `均值${unit}` : unit;
    return `<article class="bc-card bc-card-dist">${cardHead(title,subtitle,unitLabel)}<div class="bc-dist">${rows}${restRow}</div><p class="bc-footnote">${note || `按 task ${mode==='mean'?'取组内均值':'合计'}，柱内按实验堆叠，同图共用刻度；列出前 ${shown.length} 个 task${rest.length?`，其余 ${rest.length} 个合并为一行`:''}。`}</p></article>`;
  }

  // ── 分布图 2：事件发生在一次运行的第几轮（热力图，按组归一化） ──
  function positions(title,subtitle,cats,{note='',basis='decisions'}={}) {
    const BUCKETS=['前 20%','20–40%','40–60%','60–80%','后 20%'];
    const rows=series.map(g=>{
      if(g.audit_completion==='pending') return {g,pending:true};
      const acc=[0,0,0,0,0]; let total=0,pos=0;
      for(const r of g.runs){
        const T=r.c.metrics.turns;
        for(const e of (r.c.events||[])){
          if(!cats.includes(e.category)) continue;
          total++;
          let fraction=null;
          if(basis==='video') {
            const duration=r.c.video_duration_seconds, range=e.time_range;
            if(Number.isFinite(duration)&&duration>0&&Array.isArray(range)&&range.length===2&&
                range.every(Number.isFinite)&&0<=range[0]&&range[0]<=range[1]&&range[1]<=duration)
              fraction=range[0]/duration;
          } else if(Number.isInteger(T)&&T>0) {
            const window=e.decision_window;
            if(Array.isArray(window)&&window.length===2&&window.every(Number.isInteger)&&
                0<=window[0]&&window[0]<=window[1]&&window[1]<T) fraction=window[0]/T;
            else if(Array.isArray(e.turns)&&e.turns.length&&
                e.turns.every(t=>Number.isInteger(t)&&1<=t&&t<=T)) fraction=(Math.min(...e.turns)-1)/T;
          }
          if(fraction===null) continue;
          pos++;
          acc[Math.min(4,Math.floor(fraction*5))]++;
        }
      }
      return {g,acc,total,pos};
    });
    const tint=(color,a)=>color+Math.round(Math.min(.9,Math.max(.05,a))*255).toString(16).padStart(2,'0');
    const head=`<div class="bc-heat-row bc-heat-head"><span>实验</span>${BUCKETS.map(b=>`<span>${b}</span>`).join('')}<span>可定位</span></div>`;
    const body=rows.map(r=>{
      if(r.pending) return `<div class="bc-heat-row bc-heat-pending"><span class="bc-heat-name">${label(r.g)}</span><span class="bc-heat-span">待审核，暂不计入</span></div>`;
      const cov=r.total?r.pos/r.total:1;
      const cells=r.pos?BUCKETS.map((b,i)=>{
        const pct=r.acc[i]/r.pos*100;
        return `<span class="bc-heat-cell" style="background:${tint(r.g.color,pct/100)};color:${pct>55?'#fff':'var(--ink)'}" title="${esc(r.g.name)} · ${b} · ${pct.toFixed(1)}%（${r.acc[i]}/${r.pos} 个事件）">${pct<0.5?'·':pct.toFixed(0)+'%'}</span>`;
      }).join(''):BUCKETS.map(()=>`<span class="bc-heat-cell bc-heat-na" title="${esc(r.g.name)}：${basis==='video'?'缺少有效视频时间或已核实的完整时长':'缺少有效决策区间或轮次'}">—</span>`).join('');
      const warn=cov<0.5?' bc-heat-warn':'';
      return `<div class="bc-heat-row" data-position-group="${esc(r.g.id)}" data-position-basis="${basis}" data-position-counts="${r.acc.join(',')}"><span class="bc-heat-name">${label(r.g)}</span>${cells}<span class="bc-heat-cov${warn}" title="具备${basis==='video'?'视频进度':'决策进度'}位置的事件数 / 全部相关事件数">${r.pos}/${r.total}${cov<0.5?' ⚠':''}</span></div>`;
    }).join('');
    return `<article class="bc-card bc-card-wide">${cardHead(title,subtitle,'%')}<div class="bc-heat" role="table" aria-label="${esc(title)}">${head}${body}</div><p class="bc-footnote">${note || '每行按该组自身事件数归一化，便于在总量不同的组之间比较；单元格为该区间占可定位事件的比例，颜色深浅同步表示比例。'}</p></article>`;
  }


  // ── 补充 1：任务难度排序（芯片网格）──
  function ranking() {
    const audited=series.filter(g=>g.audit_completion!=='pending');
    if(!audited.length) return `<article class="bc-card bc-card-wide bc-card-pending">${cardHead('任务难度排序','按完全成功率分组','—')}<p class="bc-footnote">当前范围内没有已完成审核的实验。</p></article>`;
    const byTask=new Map();
    for(const g of audited) for(const r of g.runs){
      const t=r.c.task;
      if(!byTask.has(t)) byTask.set(t,{cells:[],succ:0,n:0,empty:0,drop:0});
      const row=byTask.get(t), ok=r.c.metrics.success===1;
      row.cells.push({g,ok}); row.n++; if(ok)row.succ++;
      row.empty+=(r.c.metrics.emptyRetry||0); row.drop+=(r.c.metrics.drops||0);
    }
    const list=[...byTask.entries()].map(([t,r])=>({t,...r}))
      .sort((a,b)=>(a.succ/a.n)-(b.succ/b.n)||(b.empty+b.drop)-(a.empty+a.drop));
    const never=list.filter(x=>x.succ===0).length;
    const chip=x=>{
      const dots=audited.map(g=>{
        const c=x.cells.find(c=>c.g.id===g.id);
        if(!c) return `<i class="bc-chip-dot" title="${esc(g.name)}：未运行"></i>`;
        return `<i class="bc-chip-dot${c.ok?' bc-chip-ok':''}"${c.ok?` style="background:${g.color};border-color:${g.color}"`:''} title="${esc(g.name)}：${c.ok?'成功':'未成功'}"></i>`;
      }).join('');
      const ev=x.empty||x.drop?`空夹 ${x.empty} · 掉落 ${x.drop}`:'无空夹与掉落';
      return `<div class="bc-chip${x.succ?' bc-chip-win':''}" title="${esc(x.t)} · ${Math.round(x.succ/x.n*100)}% 成功 · ${ev}"><span class="bc-chip-name">${esc(x.t)}</span><span class="bc-chip-meta">${dots}<span class="bc-chip-rate">${Math.round(x.succ/x.n*100)}%</span></span></div>`;
    };
    return `<article class="bc-card bc-card-wide">${cardHead('任务难度排序','按完全成功率升序；三格依次对应三个实验，实心＝成功','排名')}
      <p class="bc-rank-summary"><strong>${never}</strong> / ${list.length} 个 task 在三个实验里全部失败；只有 <strong>${list.length-never}</strong> 个至少成功过一次。</p>
      <div class="bc-chips">${list.map(chip).join('')}</div>
      <div class="bc-sc-legend">${audited.map(g=>`<span class="bc-legend"><i style="background:${g.color}"></i>${esc(g.name)}</span>`).join('')}</div>
      <p class="bc-footnote">只用已完成审核的实验；semantic-eef 待复核，暂不参与。悬停任意任务可看其空夹与掉落合计。</p></article>`;
  }

  // ── 补充 2：执行成本 vs 得分散点 ──
  function scatter() {
    const pts=[];
    for(const g of series) for(const r of g.runs){
      const x=r.c.metrics.turns, y=r.c.metrics.score;
      if(x==null||y==null) continue;
      pts.push({g,x,y});
    }
    if(!pts.length) return `<article class="bc-card bc-card-pending">${cardHead('执行成本 vs 得分','每条运行一个点','—')}<p class="bc-footnote">当前范围内没有同时具备轮数与得分的运行。</p></article>`;
    const W=980,H=330,PL=46,PR=16,PT=14,PB=38;
    const xmax=Math.max(...pts.map(p=>p.x))*1.06||1;
    const sx=v=>PL+(v/xmax)*(W-PL-PR), sy=v=>H-PB-v*(H-PT-PB);
    const yTicks=[0,.25,.5,.75,1];
    const xStep=xmax>80?20:xmax>40?10:5;
    const xTicks=[];for(let v=0;v<=xmax;v+=xStep)xTicks.push(v);
    const gy=yTicks.map(v=>`<line x1="${PL}" x2="${W-PR}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" class="bc-sc-grid"/><text x="${PL-10}" y="${(sy(v)+4).toFixed(1)}" text-anchor="end" class="bc-sc-tick">${v===0||v===1?v:v.toFixed(2)}</text>`).join('');
    const gx=xTicks.map(v=>`<text x="${sx(v).toFixed(1)}" y="${H-PB+18}" text-anchor="middle" class="bc-sc-tick">${v}</text>`).join('');
    const dots=pts.map(p=>`<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.4" fill="${p.g.color}" fill-opacity=".72" stroke="#fff" stroke-width=".7"><title>${esc(p.g.name)} · ${p.x} 轮 · ${p.y.toFixed(2)} 分</title></circle>`).join('');
    return `<article class="bc-card bc-card-wide">${cardHead('执行成本 vs 得分','横轴轮数，纵轴任务得分；每条运行一个点','分')}<svg class="bc-scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="轮数与得分散点图">${gy}${gx}
      <text x="${PL-10}" y="${PT-2}" text-anchor="end" class="bc-sc-tick">分</text>
      <text x="${W-PR}" y="${H-8}" text-anchor="end" class="bc-sc-tick">轮</text>
      ${dots}</svg>
      <div class="bc-sc-legend">${series.map(g=>`<span class="bc-legend"><i style="background:${g.color}"></i>${esc(g.name)}</span>`).join('')}</div>
      <p class="bc-footnote">得分取自原生结果，与事件审核状态无关，因此四组同图；点在下、右代表花费更多轮次却得分更低。</p></article>`;
  }

  // ── 补充 3：事件共现矩阵 ──
  function cooccurrence() {
    const CATS=[['view','视野调整'],['empty_retry','空夹'],['drop','掉落'],['table_transfer','换手'],['direct_failed','直抓失败'],['recovery_other','其他恢复']];
    const audited=series.filter(g=>g.audit_completion!=='pending');
    const sets=[];audited.forEach(g=>g.runs.forEach(r=>sets.push(new Set((r.c.events||[]).map(e=>e.category)))));
    if(!sets.length) return `<article class="bc-card bc-card-pending">${cardHead('事件共现','同一运行内两类事件同时出现的比例','—')}<p class="bc-footnote">当前范围内没有可用的已审核事件。</p></article>`;
    const N=sets.length;
    const jac=(a,b)=>{let both=0,either=0;for(const s of sets){const A=s.has(a),B=s.has(b);if(A&&B)both++;if(A||B)either++;}return either?both/either:0;};
    const diag=a=>sets.filter(s=>s.has(a)).length/N;
    const tint=v=>v<=0?'transparent':`rgba(45,107,70,${(0.06+Math.min(1,v)*0.74).toFixed(2)})`;
    const head=`<div class="bc-co-row bc-co-head"><span></span>${CATS.map(([k,n])=>`<span>${n}</span>`).join('')}</div>`;
    const body=CATS.map(([ka,na])=>`<div class="bc-co-row"><span class="bc-co-name">${na}</span>${CATS.map(([kb,nb])=>{
      const v=ka===kb?diag(ka):jac(ka,kb);
      return `<span class="bc-co-cell" style="background:${tint(v)};color:${v>.55?'#fff':'var(--ink)'}" title="${na}${ka===kb?'（涉及运行占比）':` 与 ${nb} 同时出现`}：${(v*100).toFixed(0)}%">${v<=0?'·':(v*100).toFixed(0)+'%'}</span>`;
    }).join('')}</div>`).join('');
    return `<article class="bc-card bc-card-wide">${cardHead('事件共现','同一运行内两类事件同时出现的比例','%')}<div class="bc-co">${head}${body}</div><p class="bc-footnote">单元格为 Jaccard 比例（同时出现 / 至少出现其一），对角线为涉及该事件的运行占比；基于 ${N} 条已审核运行。数值越高说明两类现象越常结伴发生，不代表因果。</p></article>`;
  }


  // ── 诊断 1：成功 vs 失败的执行特征 ──
  function miniGB(cats,{unit='',decimals=1,fixed=null,title=''}={}) {
    const used=series.filter(g=>cats.some(c=>c.vals.some(v=>v.g.id===g.id)));
    const vals=cats.flatMap(c=>c.vals.map(v=>v.v));
    if(!used.length||!vals.length) return '';
    const auto=axisMax(Math.max(...vals,1e-9));
    const max=(fixed!=null&&vals.every(v=>v<=fixed))?fixed:auto;
    const W=760,H=172,PL=42,PR=12,PT=12,PB=30;
    const slot=(W-PL-PR)/cats.length, bw=Math.min(30,slot*0.62/used.length);
    const y=v=>H-PB-(v/max)*(H-PT-PB);
    const grid=[0,max/2,max].map(t=>`<line x1="${PL}" x2="${W-PR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="bc-sc-grid"/><text x="${PL-8}" y="${(y(t)+3.5).toFixed(1)}" text-anchor="end" class="bc-sc-tick">${num(t,decimals)}</text>`).join('');
    const bars=cats.map((c,i)=>{
      const st=PL+slot*i+slot/2-(bw*used.length)/2;
      return c.vals.map(v=>{
        const gi=used.findIndex(u=>u.id===v.g.id);
        return `<rect x="${(st+bw*gi).toFixed(1)}" y="${y(v.v).toFixed(1)}" width="${Math.max(2,bw-3).toFixed(1)}" height="${Math.max(0,(H-PB-y(v.v))).toFixed(1)}" rx="2" fill="${v.g.color}"><title>${esc(v.g.name)} · ${esc(c.t)} · ${num(v.v,decimals)}${unit}</title></rect>`;
      }).join('');
    }).join('');
    const labels=cats.map((c,i)=>{
      const cx=(PL+slot*i+slot/2).toFixed(1);
      const zero=c.vals.length>0&&c.vals.every(v=>v.v===0);
      return `<text x="${cx}" y="${H-PB+17}" text-anchor="middle" class="bc-gb-label">${esc(c.t)}</text>`
        +(zero?`<text x="${cx}" y="${(H-PB-5).toFixed(1)}" text-anchor="middle" class="bc-gb-zero">0%</text>`:'');
    }).join('');
    return `<div class="bc-gb">${title?`<div class="bc-gb-title">${title}</div>`:''}<svg viewBox="0 0 ${W} ${H}" class="bc-gb-svg" role="img" aria-label="${esc(title)}">${grid}${bars}${labels}</svg></div>`;
  }

  function successVsFail() {
    const cat=(ok,fn)=>series.map(g=>{
      const rs=g.runs.filter(r=>(r.c.metrics.turns||0)>0 && (r.c.metrics.success===1)===ok);
      if(!rs.length) return null;
      return {g,v:fn(rs)};
    }).filter(Boolean);
    const apt=[{t:'成功',vals:cat(true,rs=>rs.reduce((s,r)=>s+r.c.metrics.actions,0)/rs.reduce((s,r)=>s+r.c.metrics.turns,0))},
               {t:'失败',vals:cat(false,rs=>rs.reduce((s,r)=>s+r.c.metrics.actions,0)/rs.reduce((s,r)=>s+r.c.metrics.turns,0))}];
    const turns=[{t:'成功',vals:cat(true,rs=>rs.reduce((s,r)=>s+r.c.metrics.turns,0)/rs.length)},
                 {t:'失败',vals:cat(false,rs=>rs.reduce((s,r)=>s+r.c.metrics.turns,0)/rs.length)}];
    return `<article class="bc-card bc-card-wide">${cardHead('成功与失败的成本差异','同一实验内部对比：成功的运行和失败的运行，执行节奏有什么不同','对比')}
      <div class="bc-gb-pair">${miniGB(apt,{unit:'个',decimals:1,title:'每轮 action 数'})}${miniGB(turns,{unit:'轮',decimals:0,title:'平均轮数'})}</div>
      <p class="bc-footnote">四组方向一致：成功的运行每轮动作更多、总轮数更少；失败的运行轮数更多而每轮更短——失败更像“反复犹豫”而不是“一口气走远”。只统计轮数大于 0 的运行。</p></article>`;
  }

  // ── 诊断 2：得分分布 ──
  function shareBars(rows,{unit='%'}={}) {
    if(!rows.length) return '';
    return `<div class="bc-share">${rows.map(row=>`<div class="bc-share-row"><span class="bc-share-name">${label(row.g)}</span><span class="bc-share-track">${row.segs.map(sg=>sg.v>0?`<i style="width:${(sg.v*100).toFixed(1)}%;background:${sg.color}" title="${esc(sg.label)} ${(sg.v*100).toFixed(1)}${unit}">${sg.v>.09?`<b>${Math.round(sg.v*100)}%</b>`:''}</i>`:'').join('')}</span></div>`).join('')}</div>`;
  }

  function scoreDistribution() {
    const BUCKETS=[['0 分',v=>v===0],['0–50%',v=>v>0&&v<=0.5],['50–100%',v=>v>0.5&&v<1],['100%',v=>v===1]];
    const RAMP=['#e6ede7','#9BC99A','#58A165','#2D6B46'];
    const rows=series.map(g=>{
      const n=g.runs.length;
      const counts=BUCKETS.map(([lab,test])=>g.runs.filter(r=>test(r.c.metrics.score||0)).length);
      return {g,segs:BUCKETS.map(([lab],i)=>({label:lab,v:counts[i]/n,color:RAMP[i]}))};
    });
    const legend=BUCKETS.map(([lab],i)=>`<span class="bc-legend"><i style="background:${RAMP[i]}"></i>${lab}</span>`).join('');
    return `<article class="bc-card bc-card-wide">${cardHead('得分分布','每个实验内部，运行得分落在各区间内的比例','占比')}
      ${shareBars(rows)}
      <div class="bc-tb-legend">${legend}</div>
      <p class="bc-footnote">得分实际上只有三档：0 分、部分完成（≤0.5）、满分。全库落在 50–100% 区间的运行只有 3 条——任务结果接近“成/不成”，平均值 0.4 左右是把两端拉平后的假象。</p></article>`;
  }

  // ── 诊断 3：空夹次数与成功率 ──
  function emptyRetryOutcome() {
    const BINS=[['0 次',v=>v===0],['1–2 次',v=>v>=1&&v<=2],['3–5 次',v=>v>=3&&v<=5],['6 次以上',v=>v>=6]];
    const cats=BINS.map(([lab,f])=>({t:lab,vals:series.map(g=>{
      const rs=g.runs.filter(r=>f(r.c.metrics.emptyRetry||0));
      if(!rs.length) return null;
      return {g,v:100*rs.filter(r=>r.c.metrics.success===1).length/rs.length};
    }).filter(Boolean)}));
    const total=BINS.map(([lab,f])=>{
      const rs=series.flatMap(g=>g.runs).filter(r=>f(r.c.metrics.emptyRetry||0));
      return {lab,n:rs.length,s:rs.filter(r=>r.c.metrics.success===1).length};
    });
    const legend=series.map(g=>`<span class="bc-legend"><i style="background:${g.color}"></i>${esc(g.name)}</span>`).join('');
    return `<article class="bc-card bc-card-wide">${cardHead('空夹次数与成功率','把运行按“记录了几次空夹”分组，看成功率怎么变','%')}
      ${miniGB(cats,{unit:'%',decimals:0,fixed:100})}
      <div class="bc-tb-legend">${legend}</div>
      <p class="bc-footnote">合并四组：${total.map(t=>`${t.lab} ${t.s}/${t.n}`).join(' · ')}。空夹 3 次以上的运行没有一次成功，它更像是“已经卡住”的标记，而不是原因。</p></article>`;
  }

  // ── 诊断 4：可重复性 ──
  function repeatability() {
    const multi=series.filter(g=>{const m=new Map();g.runs.forEach(r=>m.set(r.c.task,(m.get(r.c.task)||0)+1));return [...m.values()].some(n=>n>1)});
    if(!multi.length) return `<article class="bc-card bc-card-wide bc-card-pending">${cardHead('可重复性','同一任务多次运行的结果是否一致','—')}<p class="bc-footnote">当前范围内没有任务被重复运行，无法评估稳定性。</p></article>`;
    const g=multi[0], byTask=new Map();
    for(const r of g.runs){ if(!byTask.has(r.c.task)) byTask.set(r.c.task,[]); byTask.get(r.c.task).push(r); }
    const rows=[...byTask.entries()].map(([t,rs])=>({t,rs,succ:rs.filter(r=>r.c.metrics.success===1).length}))
      .sort((a,b)=>a.succ-b.succ||a.t.localeCompare(b.t));
    const mixed=rows.filter(x=>x.succ>0&&x.succ<x.rs.length);
    return `<article class="bc-card bc-card-wide">${cardHead('可重复性','同一任务多次运行的结果是否一致','次数')}
      <p class="bc-rank-summary">${esc(g.name)} 有 <strong>${rows.length}</strong> 个任务各跑了 ${rows[0].rs.length} 次，其中 <strong>${mixed.length}</strong> 个任务结果不一致——同一任务既成功过也失败过。</p>
      <div class="bc-rep">${rows.map(x=>{
        const dots=x.rs.map(r=>`<i class="bc-rep-dot${r.c.metrics.success===1?' bc-rep-ok':''}" title="得分 ${(r.c.metrics.score||0).toFixed(2)}"></i>`).join('');
        const flaky=x.succ>0&&x.succ<x.rs.length;
        return `<div class="bc-rep-row${flaky?' bc-rep-flaky':''}"><span class="bc-rep-name" title="${esc(x.t)}">${esc(x.t)}</span><span class="bc-rep-dots">${dots}</span><span class="bc-rep-score">${x.succ}/${x.rs.length}</span></div>`;
      }).join('')}</div>
      <p class="bc-footnote">实心点＝该次运行完全成功。标为不一致的任务，单次运行的结果不足以判断设置优劣——这也是跨实验比较要多种子复跑的原因。</p></article>`;
  }

  // ── 诊断 5：审计完整度 ──
  function auditQuality() {
    const ST=[['confirmed','已确认','#58A165'],['lower_bound','下界','#E68A36'],['unknown','未知','#cbd5cc']];
    const rows=series.map(g=>{
      const c={};let n=0;
      for(const r of g.runs) for(const v of Object.values(r.c.metricStatus||{})){c[v]=(c[v]||0)+1;n++;}
      if(!n) return {g,segs:ST.map(([k,lab,color])=>({label:lab,v:k==='unknown'?1:0,color}))};
      return {g,segs:ST.map(([k,lab,color])=>({label:lab,v:(c[k]||0)/n,color}))};
    }).filter(Boolean);
    if(!rows.length) return '';
    return `<article class="bc-card bc-card-wide">${cardHead('审计完整度','26 项指标里有明确结论的比例；剩下的是下界与未知','状态')}
      ${shareBars(rows)}
      <div class="bc-tb-legend">${ST.map(([k,lab,color])=>`<span class="bc-legend"><i style="background:${color}"></i>${lab}</span>`).join('')}</div>
      <p class="bc-footnote">“下界”表示事件确实发生过但计数可能偏少；“未知”表示无法判定。事件类指标横比前必须先看这张图——各组的审计深度并不相同。</p></article>`;
  }

  const sections=[
    {id:'general',name:'总体表现',en:'GENERAL',desc:'先看任务结果与执行成本',cards:[
      outcome(),
      bars('平均得分','原生分数的算术平均，不合成行为总分',[['score','任务得分']],{mode:'mean',unit:'分',fixed:1,decimals:2,note:'当前任务等权；只有任务构成一致时，组间均值才便于比较。'}),
      bars('平均执行成本','分别计算每条运行的成本', [['turns','运行轮数']],{mode:'mean',unit:'轮',decimals:1,note:'semantic-eef使用已核对的原生模型决策轮；其他组按各自来源口径，详见实验配置与覆盖说明。'}),
      bars('平均 action 次数','每条运行实际执行的控制步数',[['actions','实际控制步']],{mode:'mean',unit:'步',decimals:1,note:'包含成功和未成功运行；较少步骤也可能来自提前结束。'}),
      bars('每轮对应的 action 数','一次决策平均执行多少个底层控制步；数值越高，单次决策执行得越长',[['actionsPerTurn','每轮 action 数']],{mode:'mean',unit:'个',decimals:1,fixed:12,note:'按每条运行的 action ÷ turn 取平均；只统计 turn>0 的运行。轮次越多、每次执行越短，这个值越低。'})
    ]},
    {id:'grasp',name:'夹取',en:'GRASP',desc:'抓取失败、恢复与目标选择',cards:[
      bars('空夹与掉落','已确认事件；点击柱形查看该实验的事件', [['emptyRetry','已记录空夹','empty_retry'],['drops','夹起后掉落','drop']],{note:'semantic-eef空夹包含最终未重试的独立尝试，掉落仅主动释放前失持；其他组口径见各组说明。'}),
      bars('涉及运行比例','至少发生过一次该事件的运行占比',[['emptyRetry','已记录空夹','empty_retry'],['drops','夹起后掉落','drop']],{mode:'incidence',unit:'%',fixed:100,decimals:1,note:'分母为有记录的运行数，不是抓取尝试数；不是抓取失败率。'}),
      bars('成功重夹与目标选择','需要关联失败事件和后续成功抓取',[['emptyRegrasp','空夹后成功重夹'],['dropRegrasp','掉落后成功重夹'],['wrongObject','选错物体']]),
      positions('失败发生在视频的哪个阶段','视觉证据区间起点 ÷ 该 run 完整视频时长',['empty_retry','drop'],{basis:'video',note:'按已记录视觉区间的起点分桶；宽区间不代表精确失败瞬间。只使用已有时间范围与三路一致的已核实时长，缺少时长的组保持未知；不由轮次推算视频时间。'}),
      positions('失败关联的决策进度','日志决策窗口起点 ÷ 该 run 总决策数',['empty_retry','drop'],{note:'日志零基决策区间与协议一基轮次分别归一化；取窗口起点，不代表精确视频对时。没有可靠决策对应关系的事件保留未知。100%表示运行末段，不等于预算耗尽。'})
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
    ]},
    {id:'profile',name:'任务画像',en:'PROFILE',desc:'按任务横切：难度排序、成本与得分的取舍、事件共现',cards:[
      ranking(),
      scatter(),
      cooccurrence()
    ]},
    {id:'insight',name:'诊断',en:'DIAGNOSTICS',desc:'拆开平均值：成败差异、结果分布、稳定性与审计深度',cards:[
      successVsFail(),
      scoreDistribution(),
      emptyRetryOutcome(),
      repeatability(),
      auditQuality()
    ]}
  ];
  const episodes=new Map();for(const r of runs){const k=JSON.stringify([r.c.task,r.c.episode.variant,r.c.episode.seed,r.c.episode.scene]);if(!episodes.has(k))episodes.set(k,[]);episodes.get(k).push(r)}
  const matched=active.length>1?[...episodes.values()].filter(rs=>active.every(g=>rs.filter(r=>r.g.id===g.id).length===1)).length:0;
  const uncertainty=runs.reduce((n,r)=>n+(r.c.metrics.uncertain||0),0);
  const semanticRuns=runs.filter(r=>r.g.id==='semantic'&&r.c.audit_source);
  const source=semanticRuns.length?groups.find(g=>g.id==='semantic').audit_source:null;
  const sourcePanel=source?`<div class="bc-source"><div><b>semantic-eef · 69 case 审核已接入</b><p>当前选中 ${semanticRuns.length} 条 · 动作记录与关键帧核查，非全视频逐帧审核</p></div><a class="button" href="${esc(source.report_url)}" target="_blank" rel="noopener">完整报告与证据 ↗</a><a class="button" href="${esc(source.counts_url)}" target="_blank" rel="noopener">统计表 ↗</a><a class="button" href="${esc(source.bundle_url)}" download>完整打包 ↓</a></div>`:'';
  const semantic=active.find(g=>g.id==='semantic'&&g.submission_links);
  const semanticPanel=semantic?`<div class="bc-source"><div><b>semantic-eef · ${semantic.audit_completion==='pending'?'阶段性结果：完整审核未完成':'26项标准包已同步'}</b><p>${semantic.cases.length}个run · ${semantic.cases.reduce((n,c)=>n+(c.events||[]).length,0)}条事件 · ${semantic.audit_completion==='pending'?'完整审核待完成，旧版事件不作为最终计数':'†为确认下界'}</p></div><a class="button" href="${esc(semantic.submission_links.csv)}">标准CSV</a><a class="button" href="${esc(semantic.submission_links.bundle)}">submission.json</a><a class="button" href="${esc(semantic.submission_links.events)}">events.json</a><a class="button" href="${esc(semantic.submission_links.validation)}">校验记录</a>${semantic.submission_links.coverage?`<a class="button" href="${esc(semantic.submission_links.coverage)}">观看覆盖记录</a>`:''}</div>`:'';
  const persistent=active.find(g=>g.id==='persistent'&&g.submission_links);
  const persistentPanel=persistent?`<div class="bc-source"><div><b>persistent-cap20 · 26项标准包已更新</b><p>42个run · 292条事件 · 0阻断 · 靠近action确认5次、turn确认4次（各3任务未知） · †为确认下界</p></div><a class="button" href="${esc(persistent.submission_links.budget_review)}">预算复核</a><a class="button" href="${esc(persistent.submission_links.xlsx)}">Excel</a><a class="button" href="${esc(persistent.submission_links.csv)}">标准CSV</a><a class="button" href="${esc(persistent.submission_links.bundle)}">submission.json</a><a class="button" href="${esc(persistent.submission_links.validation)}">校验记录</a></div>`:'';
  const scope=series.map(g=>`${g.name} ${g.runs.length} 条运行`).join(' / ');
  return `<div class="bc-intro"><div><p class="eyebrow">BEHAVIOR OVERVIEW</p><h1>从总体结果，到每一类行为</h1><p class="subtitle">${esc(scope)} · 所有图表随上方筛选联动</p></div><button class="button" id="export-scope">导出当前范围 JSON ↓</button></div>
    <div class="bc-toolbar"><div class="bc-global-legend">${series.map(label).join('')}</div><span>颜色固定代表实验，不表示好坏</span></div>
    <nav class="bc-section-nav" aria-label="行为分区">${sections.map((s,i)=>`<button data-chart-section="${s.id}"><small>${String(i).padStart(2,'0')}</small>${s.name}</button>`).join('')}</nav>
    ${sourcePanel}${semanticPanel}${persistentPanel}<div class="notice bc-notice">${active.length>1?`当前范围有 ${matched} 组相同 task / variant / seed / scene 可配对。各组任务构成、实验设置与证据覆盖不同，汇总值仅描述各自样本。`:'当前为单实验范围，图表描述所选样本。'} 事件数为确认下限；“待补标”不等于 0。${uncertainty?` 当前 ${uncertainty} 条事件待确认，未并入相应确认计数。`:''}${semanticRuns.length?' semantic-eef 的 3 次空夹/掉落待定事件只归入其中一类，不可双计；主动释放后落下已从掉落计数中排除。':''}</div>
    ${sections.map((s,i)=>{const cs=s.cards.flat().filter(Boolean);return `<section class="bc-section" id="behavior-${s.id}" aria-labelledby="behavior-title-${s.id}"><header class="bc-section-head"><span class="bc-section-number">${String(i).padStart(2,'0')}</span><div><p>${s.en}</p><h2 id="behavior-title-${s.id}">${s.name}</h2></div><span class="bc-section-description">${s.desc}</span></header><div class="bc-grid ${cs.some(c=>String(c).includes('bc-card-wide'))?'bc-grid-stack':(cs.length===4?'bc-grid-general':cs.length===3?'bc-grid-three':'')}">${cs.join('')}</div></section>`}).join('')}
    <details class="bc-config"><summary>查看实验配置与证据覆盖</summary><div class="settings-grid">${settings}</div></details>
    <div class="bc-bottom"><span>需要查看每个 task 的具体数值？</span><a class="button" data-page="cases" href="#cases">查看全部逐任务指标 →</a></div>`;
};
