(function(){
'use strict';
const D=window.AUDIT_DATA, defs=D.definitions, main=document.getElementById('main'),dialog=document.getElementById('case-dialog'),detail=document.getElementById('detail-content');
const records=D.groups.flatMap(g=>g.cases.map(c=>({g,c}))), metricGroups=[...new Set(defs.map(d=>d.group))];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={page:'overview',experiment:'all',task:'all',variant:'all',seed:'all',scene:'all',mode:'runs',metric:'all',search:'',category:'all',eventSearch:''};
const fields=['experiment','task','variant','seed','scene'];
const get=(r,k)=>k==='experiment'?r.g.id:k==='task'?r.c.task:String(r.c.episode[k]??'unknown');
const epkey=r=>JSON.stringify([r.c.task,r.c.episode.variant??null,r.c.episode.seed??null,r.c.episode.scene??null]);
const selected=()=>records.filter(r=>fields.every(k=>state[k]==='all'||get(r,k)===state[k]));
function normalize(){let base=records;for(const k of fields){const values=[...new Set(base.map(r=>get(r,k)))];if(state[k]!=='all'&&!values.includes(state[k]))state[k]='all';base=base.filter(r=>state[k]==='all'||get(r,k)===state[k])}}
function readURL(){const [p,q]=location.hash.slice(1).split('?');if(['overview','cases','events','protocol'].includes(p))state.page=p;const params=new URLSearchParams(q);for(const k of fields.concat(['mode','metric','category']))state[k]=params.get(k)??(k==='mode'?'runs':'all');if(!['runs','compare'].includes(state.mode))state.mode='runs';normalize()}
function writeURL(){const p=new URLSearchParams();for(const k of fields.concat(['mode','metric','category']))if(state[k]!=='all'&&!(k==='mode'&&state[k]==='runs'))p.set(k,state[k]);history.replaceState(null,'','#'+state.page+(p.size?'?'+p:''))}
function change(patch){Object.assign(state,patch);normalize();writeURL();render()}
function selectionLabel(){return fields.map(k=>({experiment:'实验设置',task:'task',variant:'variant',seed:'seed',scene:'scene'}[k])+': '+(state[k]==='all'?'全部':k==='experiment'?D.groups.find(g=>g.id===state[k]).name:state[k])).join(' · ')}
function selector(){let base=records;const labels={experiment:'实验设置',task:'Task',variant:'Variant',seed:'Seed',scene:'Scene'};const controls=fields.map(k=>{const values=[...new Set(base.map(r=>get(r,k)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));const h=`<label>${labels[k]}<select id="scope-${k}" data-scope="${k}" aria-label="${labels[k]}"><option value="all">全部${k==='experiment'?'实验设置':''}</option>${values.map(v=>`<option value="${esc(v)}" ${state[k]===v?'selected':''}>${esc(k==='experiment'?D.groups.find(g=>g.id===v).name:v)}</option>`).join('')}</select></label>`;base=base.filter(r=>state[k]==='all'||get(r,k)===state[k]);return h}).join('');return `<section class="scope-panel" aria-label="全局数据范围"><div class="scope-head"><b>选择实验与任务条件</b><button class="button" id="reset-scope">重置范围</button></div><div class="scope-controls">${controls}</div><p id="scope-summary">${esc(selectionLabel())} · <strong>${selected().length} 条运行</strong></p><small>当前数据只有 seed 0、scene 0。切换页面保留筛选；指标、事件和导出均使用此范围。</small></section>`}
function heading(title,text){return `<div class="heading"><div><p class="eyebrow">EXPERIMENT / TASK / SEED / SCENE</p><h1>${title}</h1><p class="subtitle">${text}</p></div><button class="button" id="export-scope">导出当前范围 JSON ↓</button></div>`}
const gname=r=>`<span class="group-pill ${r.g.id==='persistent'?'persistent':''}">● ${esc(r.g.name)}</span>`;
function cell(c,key){const v=c.metrics[key];if(v==null)return '<span class="pending">待补标</span>';if(key==='success')return v?'是':'否';if(key==='score')return Number(v).toFixed(2);return esc(v)}
function sum(rs,key){const vs=rs.map(r=>r.c.metrics[key]).filter(v=>v!=null);return vs.length?vs.reduce((a,b)=>a+b,0):null}
function settingPanels(){return D.groups.filter(g=>selected().some(r=>r.g.id===g.id)).map(g=>{const rs=selected().filter(r=>r.g.id===g.id), configs=[...new Set(rs.map(r=>JSON.stringify(r.c.configuration)))];return `<details class="setting-panel"><summary>${esc(g.name)} · ${rs.length} 条运行 · ${configs.length} 种已记录配置</summary><p>证据覆盖：${esc(g.coverage)}</p>${configs.map(j=>{const conf=JSON.parse(j);return `<dl>${Object.entries(conf).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v==null?'未提供':esc(v)}</dd>`).join('')}</dl>`}).join('')}</details>`}).join('')}
function overview(){return window.renderBehaviorOverview({runs:selected(),groups:D.groups,escape:esc,settings:settingPanels()})}
function taskCell(r){return `<button class="task-button" data-run="${esc(r.c.run_id)}" data-exp="${r.g.id}">${esc(r.c.task)}<small>${esc(r.c.instruction)}</small></button>`}
function runTable(rs,columns){return `<div class="table-scroll matrix"><table><thead><tr><th>Task</th><th>实验设置</th><th>Variant</th><th>Seed</th><th>Scene</th>${columns.map(d=>`<th title="${esc(d.description)}">${d.label}</th>`).join('')}</tr></thead><tbody>${rs.map(r=>`<tr><td class="task-cell">${taskCell(r)}</td><td>${gname(r)}</td><td>${esc(r.c.episode.variant)}</td><td>${esc(r.c.episode.seed)}</td><td>${esc(r.c.episode.scene)}</td>${columns.map(d=>`<td>${cell(r.c,d.key)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${columns.length+5}" class="empty">当前范围没有运行</td></tr>`}</tbody></table></div>`}
function pairs(rs){const map=new Map();for(const r of rs){const k=epkey(r);if(!map.has(k))map.set(k,[]);map.get(k).push(r)}return [...map.values()].filter(a=>D.groups.every(g=>a.filter(r=>r.g.id===g.id).length===1))}
function compareTable(rs,cols){if(state.experiment!=='all')return '<p class="empty">跨实验对比需要选择“全部实验设置”。当前单实验运行可在“逐条运行”模式查看。</p>';const ps=pairs(rs);return `<p class="count-line">${ps.length} 组可唯一配对的任务条件 · ${rs.length-ps.length*D.groups.length} 条未配对或重复运行不计算差值。每格标注实验名称。</p><div class="table-scroll matrix"><table><thead><tr><th>Task / Variant / Seed / Scene</th>${cols.map(d=>`<th>${d.label}</th>`).join('')}<th>得分差 P − S</th></tr></thead><tbody>${ps.map(pair=>{const r=pair[0],s=pair.find(x=>x.g.id==='semantic'),p=pair.find(x=>x.g.id==='persistent');return `<tr><td class="task-cell"><button class="task-button" data-episode="${esc(epkey(r))}">${esc(r.c.task)}<small>${esc(r.c.episode.variant)} · seed ${r.c.episode.seed} · scene ${r.c.episode.scene}</small></button></td>${cols.map(d=>`<td>${pair.map(x=>`<div class="compare-cell">${gname(x)} ${cell(x.c,d.key)}</div>`).join('')}</td>`).join('')}<td>${(p.c.score-s.c.score).toFixed(2)}</td></tr>`}).join('')||'<tr><td class="empty">没有可唯一配对的运行</td></tr>'}</tbody></table></div>`}
function cases(){const cols=defs.filter(d=>state.metric==='all'||d.group===state.metric);const rs=selected().filter(r=>(r.c.task+' '+r.c.instruction).toLowerCase().includes(state.search.toLowerCase()));return heading('任务与运行','默认一行一条运行；切换“跨实验对比”后，按 task + variant + seed + scene 唯一配对。')+`<section class="panel table-panel"><div class="filters"><label class="search">搜索任务或指令<input type="search" id="case-search" value="${esc(state.search)}"></label><label>显示方式<select id="mode">${[['runs','逐条运行'],['compare','跨实验对比']].map(([v,l])=>`<option value="${v}" ${state.mode===v?'selected':''}>${l}</option>`).join('')}</select></label><label>指标类别<select id="metric-category"><option value="all">全部 26 项指标</option>${metricGroups.map(g=>`<option ${state.metric===g?'selected':''}>${g}</option>`).join('')}</select></label></div><p class="count-line">${rs.length} 条运行 · ${cols.length} 项指标 · 待补标不等于 0</p>${state.mode==='compare'&&state.experiment!=='all'?`<p class="count-line">跨实验对比需要选择“全部实验设置”；当前已回退为逐条运行。</p>`+runTable(rs,cols):(state.mode==='runs'?runTable(rs,cols):compareTable(rs,cols))}</section>`}
function evidence(fs,run){const vids=Object.fromEntries((run.c.videos||[]).map(v=>[v.key,v]));return `<div class="evidence-links">${fs.map(f=>{const cams=(f.cameras||[]).map(k=>vids[k]).filter(Boolean);const when=f.turn!=null?`T${f.turn}`:(f.time_range?`${Number(f.time_range[0]).toFixed(1)}–${Number(f.time_range[1]).toFixed(1)}s`:(f.frame!=null?`F${f.frame}`:'轮次未知'));
    return `<div class="evidence-row"><span class="ev-meta">${when}${f.precision==='approx'?' ~':''}${f.env_step!=null?` · E${f.env_step}`:''}${f.frame!=null?` · F${f.frame}`:''}</span>${cams.length?cams.map(v=>`<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.name)} ↗</a>`).join(''):`<span class="pending">无公开视频/图像素材</span>`}</div>`}).join('')}</div><p class="evidence-note">图片与视频不在本站托管，链接指向原始公开文件；原始帧率未公开，因此不标注秒级时间点。</p>`}
function eventCard(r,e){return `<details class="event-card"><summary class="event-summary"><span class="event-icon">◎</span><span class="event-text"><b>${esc(D.labels[e.category])} · ${esc(r.c.task)}</b><small>${esc(r.g.name)} · ${esc(r.c.episode.variant)} · seed ${r.c.episode.seed} · scene ${r.c.episode.scene}<br>${esc(e.object)} · ${esc(e.arm)} · ${e.turns&&e.turns.length?'T'+e.turns.join(', T'):'轮次未知'}</small></span><span class="tag ${e.confidence==='待确认'?'warning':''}">${e.confidence}</span></summary><div class="event-body"><p>${esc(e.note)}</p>${evidence(e.evidence,r)}</div></details>`}
function events(){const es=selected().flatMap(r=>r.c.events.map(e=>({r,e}))).filter(({r,e})=>(state.category==='all'||e.category===state.category)&&JSON.stringify([r.c.task,e.note,e.object]).toLowerCase().includes(state.eventSearch.toLowerCase()));return heading('事件与证据','事件遵循相同全局筛选，保留所属实验设置、task、seed、scene 与运行标识。')+`<div class="filters"><label class="search">搜索事件<input type="search" id="event-search" value="${esc(state.eventSearch)}"></label><label>事件类别<select id="event-cat"><option value="all">全部类别</option>${Object.entries(D.labels).map(([k,v])=>`<option value="${k}" ${state.category===k?'selected':''}>${v}</option>`).join('')}</select></label></div><p class="count-line">${es.length} 条事件 · ${selected().length} 条运行</p><div class="event-list">${es.map(({r,e})=>eventCard(r,e)).join('')||'<p class="empty">当前条件没有已标注事件。</p>'}</div>`}
function openRuns(rs){detail.innerHTML=`<div class="detail-inner"><p class="eyebrow">RUN INSPECTOR</p><h2 id="detail-title">${esc(rs[0].c.task)}</h2><p class="subtitle">${esc(rs[0].c.instruction)}</p>${rs.map(r=>`<div class="detail-score">${gname(r)}<p>variant ${esc(r.c.episode.variant)} · seed ${r.c.episode.seed} · scene ${r.c.episode.scene}</p><small class="run-id">run_id: ${esc(r.c.run_id)}</small><b>${Number(r.c.score).toFixed(2)}</b><p>${r.c.turns} 轨迹轮 · ${r.c.controls} 控制步</p><details><summary>本次运行的实验配置</summary><pre>${esc(JSON.stringify(r.c.configuration,null,2))}</pre></details></div>`).join('')}<h3 style="margin:20px 0">全部逐任务指标</h3><div class="table-scroll"><table><thead><tr><th>指标</th>${rs.map(r=>`<th>${esc(r.g.name)}</th>`).join('')}</tr></thead><tbody>${defs.map(d=>`<tr><td title="${esc(d.description)}">${d.label}</td>${rs.map(r=>`<td>${cell(r.c,d.key)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><h3 style="margin:20px 0">事件证据</h3><div class="event-list">${rs.map(r=>r.c.events.map(e=>eventCard(r,e)).join('')||`<p>${esc(r.g.name)}：未确认发现已审核类别的事件。</p>`).join('')}</div>${rs.map(r=>(r.c.videos||[]).length?`<details class="gallery"><summary>${esc(r.g.name)} · 原始视频（外链）</summary><ul class="video-list">${r.c.videos.map(v=>`<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.name)}.mp4 ↗</a><small>${v.bytes?Math.round(v.bytes/1024)+' KB':''} ${v.sha256?'· sha256 '+esc(v.sha256.slice(0,12))+'…':''}</small></li>`).join('')}</ul><p class="evidence-note">未托管；点击下载原始公开视频。</p></details>`:'').join('')}</div>`;dialog.showModal()}
function settingsOverview(){return `<div class="settings-grid">${D.groups.map(g=>{const configs=[...new Set(g.cases.map(c=>JSON.stringify(c.configuration)))];return `<details class="setting-panel"><summary>${esc(g.name)} · ${g.cases.length} 条运行 · ${configs.length} 种已记录配置</summary><p>证据覆盖：${esc(g.coverage)}</p>${configs.map(j=>{const conf=JSON.parse(j);return `<dl>${Object.entries(conf).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v==null?'未提供':esc(v)}</dd>`).join('')}</dl>`}).join('')}</details>`}).join('')}</div>`}
function protocol(){
  const P=D.protocol;
  const tbl=(head,rows,cls)=>`<div class="table-scroll"><table class="protocol-table${cls?' '+cls:''}"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const ol=(items,cls)=>`<ol class="rule-list${cls?' '+cls:''}">${items.map(x=>`<li>${x}</li>`).join('')}</ol>`;
  const ul=(items)=>`<ul class="rule-list">${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
  const sec=(id,title,body)=>`<section class="panel" id="p-${id}"><h2>${title}</h2>${body}</section>`;

  const entry=`<section class="panel entry">
    <div class="entry-grid">
      <div class="entry-card">
        <p class="eyebrow">给 agent</p>
        <h3>机器可读入口</h3>
        <p>同一份规范的 Markdown 与 JSON 版本。校验器可离线运行，0 阻断即等于看板可直接接收。</p>
        <ul class="entry-links">
          <li><a href="protocol.md">protocol.md</a><small>完整规范 · 推荐先读</small></li>
          <li><a href="protocol.json">protocol.json</a><small>结构化规范 · 26 项指标与枚举</small></li>
          <li><a href="llms.txt">llms.txt</a><small>站点索引</small></li><li><a href="example/submission.json">example/</a><small>可跑校验器的示例包</small></li>
        </ul>
      </div>
      <div class="entry-card">
        <p class="eyebrow">给人</p>
        <h3>本页与工具</h3>
        <p>下方是同一内容的表格渲染。先跑校验器，再提交。</p>
        <ul class="entry-links">
          <li><a href="validate_submission.py" download>validate_submission.py</a><small>离线校验 · 仅标准库</small></li>
          <li><a href="submission.schema.json" download>submission.schema.json</a><small>JSON Schema 2020-12</small></li>
          <li><a href="ingest_submission.py" download>ingest_submission.py</a><small>校验并写入看板</small></li>
        </ul>
      </div>
    </div>
    <pre class="code-block">curl -sO ${location.origin}/protocol.md
python3 validate_submission.py ./my-submission</pre>
  </section>`;

  const quick=sec('quick','一分钟速览',
    tbl(['项','内容'],[
      ['输入',esc(P.contract.inputs.join('；'))],
      ['产出',P.contract.outputs.map(x=>`<code>${esc(x)}</code>`).join(' ')],
      ['校验',`<code>python3 validate_submission.py &lt;submission&gt;</code> → 0 阻断`],
      ['同步',`<code>python3 ingest_submission.py &lt;submission&gt; --board &lt;dist&gt;</code>`],
    ])+`<h3 style="margin:18px 0 8px">必须做到</h3>`+ul(P.contract.must.map(esc)));

  const layout=sec('layout','目录与产出',
    `<pre class="code-block">${esc(P.ingest.layout.join('\n'))}</pre>`+
    tbl(['文件','必需','职责'],P.files.map(f=>[`<code>${esc(f.name)}</code>`,f.required?'是':'否',esc(f.rule)]))+
    `<h3 style="margin:18px 0 8px">task_metrics.csv 列顺序</h3><pre class="code-block">${esc(P.columns.join(','))}</pre>`+
    `<p class="note">指标列取值：数值，或留空表示未知。不要用 0 冒充未知；核查状态写在 submission.json 的 metric_status。</p>`);

  const metrics=sec('metrics','26 项指标口径',
    tbl(['#','字段','指标','口径','未知处理'],P.metrics.map(m=>[
      String(m.index),`<code>${esc(m.field)}</code>`,esc(m.label),esc(m.rule),esc(m.unknown)]),'dense')+
    `<h3 style="margin:18px 0 8px">核查状态</h3>`+
    tbl(['status','含义','规则'],P.metric_status.map(s=>[`<code>${esc(s.value)}</code>`,esc(s.label),esc(s.rule)]))+
    `<h3 style="margin:18px 0 8px">交叉口径</h3>`+ul(P.cross_rules.map(esc)));

  const events=sec('events','事件证据',
    `<h3 style="margin:0 0 8px">类别枚举</h3>`+
    tbl(['category','名称','定义'],P.events.categories.map(c=>[`<code>${esc(c.value)}</code>`,esc(c.label),esc(c.rule)]))+
    `<h3 style="margin:18px 0 8px">事件字段</h3>`+
    tbl(['字段','类型','必需','规则'],P.events.fields.map(f=>[`<code>${esc(f.field)}</code>`,`<span class="mono-sm">${esc(f.type)}</span>`,f.required?'是':'否',esc(f.rule)]),'dense')+
    `<h3 style="margin:18px 0 8px">媒体规则</h3>`+ul(P.events.rules.map(esc)));

  const example=sec('example','submission.json 示例',
    `<details><summary>展开完整示例（1 个 run，含 26 项指标）</summary><pre class="code-block">${esc(P.example)}</pre></details>`+
    tbl(['路径','说明'],P.example_fields.map(([k,v])=>[`<code>${esc(k)}</code>`,esc(v)])));

  const checks=sec('checks','校验规则',
    `<h3 style="margin:0 0 8px">阻断项<span class="tag warning" style="margin-left:8px">任一条不过 = 不接受</span></h3>`+
    ol(P.validation.blocking.map(esc))+
    `<h3 style="margin:18px 0 8px">警告项<span class="tag" style="margin-left:8px">可通过，写进报告</span></h3>`+
    ol(P.validation.warnings.map(esc)));

  const sync=sec('sync','看板同步',
    ol(P.ingest.steps.map(esc))+
    `<h3 style="margin:18px 0 8px">字段映射</h3>`+ul(P.ingest.mapping.map(esc)));

  const S=P.submit||{};
  const detected=(()=>{const m=/^([^.]+)\.github\.io$/.exec(location.hostname);
    const seg=location.pathname.split('/').filter(Boolean)[0];
    return m?(seg?`${m[1]}/${seg}`:`${m[1]}/${m[1]}.github.io`):null;})();
  const repo=(()=>{if(!detected) return S.repo||'<owner>/<repo>';
    const base=(S.repo||'').split('/')[1];
    return base&&base.toLowerCase()===detected.split('/')[1].toLowerCase()?S.repo:detected;})();
  const repoName=repo.split('/')[1]||'repo';
  const withGit=(S.with_git||[]).map(l=>l
    .replaceAll('<owner>/<repo>',repo)
    .replaceAll('cd <repo>',`cd ${repoName}`)
    .replaceAll('{group_id}','<group_id>'));
  const submit=sec('submit','怎么提交',
    `<p class="note">仓库 <code>${esc(repo)}</code> · 目录 <code>submissions/&lt;group_id&gt;/</code> · 自检 <code>python3 validate_submission.py &lt;dir&gt;</code>（0 阻断才提交）</p>`+
    `<h3 style="margin:16px 0 8px">有 GitHub 凭据：走 PR</h3>`+
    `<pre class="code-block">${esc(withGit.join('\n'))}</pre>`+
    `<h3 style="margin:16px 0 8px">没有凭据：走 issue</h3>`+
    ul((S.without_git||[]).map(esc))+
    `<p style="margin:10px 0 0"><a class="button" href="${esc((S.issue_url||'').replace('<owner>/<repo>',repo))}" target="_blank" rel="noopener">打开提交 issue ↗</a></p>`+
    `<h3 style="margin:16px 0 8px">PR 之后会发生什么</h3>`+
    ol((S.after_pr||[]).map(esc))+
    `<h3 style="margin:16px 0 8px">更新与纠错</h3>`+
    ul((S.update_rules||[]).map(esc)));

  return heading('提交标准', `schema ${P.schema_version} · 版本 ${P.version} · 通过校验的包可直接同步进看板`)+
    entry+quick+layout+metrics+events+example+checks+sync+submit+
    `<section class="panel"><h2>当前已记录的设置</h2><p class="note">以下是从现有数据算出的口径，供提交方对照；与提交规范无关。</p></section>`+
    settingsOverview();
}

function bind(){main.querySelectorAll('[data-chart-section]').forEach(el=>el.onclick=()=>document.getElementById('behavior-'+el.dataset.chartSection).scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}));main.querySelectorAll('[data-chart-category]').forEach(el=>el.onclick=()=>{state.eventSearch='';change({page:'events',category:el.dataset.chartCategory,experiment:el.dataset.chartExperiment})});main.querySelectorAll('[data-scope]').forEach(el=>el.addEventListener('change',()=>change({[el.dataset.scope]:el.value})));document.getElementById('reset-scope').onclick=()=>change(Object.fromEntries(fields.map(k=>[k,'all'])));main.querySelectorAll('[data-page]').forEach(a=>a.onclick=e=>{e.preventDefault();change({page:a.dataset.page})});main.querySelectorAll('[data-run]').forEach(el=>el.onclick=()=>openRuns(records.filter(r=>r.g.id===el.dataset.exp&&r.c.run_id===el.dataset.run)));main.querySelectorAll('[data-episode]').forEach(el=>el.onclick=()=>openRuns(selected().filter(r=>epkey(r)===el.dataset.episode)));for(const [id,k] of [['mode','mode'],['metric-category','metric'],['event-cat','category']])document.getElementById(id)?.addEventListener('change',e=>change({[k]:e.target.value}));for(const [id,k] of [['case-search','search'],['event-search','eventSearch']])document.getElementById(id)?.addEventListener('input',e=>{const pos=e.target.selectionStart;state[k]=e.target.value;render();const next=document.getElementById(id);next.focus();next.setSelectionRange(pos,pos)});document.getElementById('export-scope').onclick=()=>{const blob=new Blob([JSON.stringify({schema_version:'2',filters:Object.fromEntries(fields.map(k=>[k,state[k]])),runs:selected().map(r=>({experiment:r.g.name,...r.c})),definitions:defs},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='robodojo-selected-runs.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}
function render(){document.querySelectorAll('.sidebar [data-page]').forEach(a=>a.classList.toggle('active',a.dataset.page===state.page));document.getElementById('crumb').textContent={overview:'评估总览',cases:'任务与运行',events:'事件与证据',protocol:'指标与提交规范'}[state.page];main.innerHTML=selector()+({overview,cases,events,protocol}[state.page])();bind()}
document.querySelectorAll('.sidebar [data-page]').forEach(a=>a.onclick=e=>{e.preventDefault();change({page:a.dataset.page})});document.getElementById('close-dialog').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});window.addEventListener('hashchange',()=>{readURL();render()});readURL();render();
})();
