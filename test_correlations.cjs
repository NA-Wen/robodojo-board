const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window: {}};
vm.runInNewContext(fs.readFileSync('charts.js', 'utf8'), context);
const stats = context.window.metricOutcomeAnalysis;
const pairs = (x,y) => x.map((v,i)=>({x:v,y:y[i]}));
const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
assert.equal(JSON.stringify(stats.ranks([10,20,20,40])), '[1,2.5,2.5,4]');
for(const method of ['spearman','pearson']) {
  close(stats.coefficient(pairs([1,2,3],[1,2,3]),method).value,1);
  close(stats.coefficient(pairs([1,2,3],[3,2,1]),method).value,-1);
  assert.equal(stats.coefficient(pairs([1,1,1],[0,1,0]),method).value,null);
  assert.equal(stats.coefficient(pairs([1,2,3],[1,1,1]),method).value,null);
  assert.equal(stats.coefficient(pairs([1,2],[0,1]),method).value,null);
}
close(stats.coefficient(pairs([1,2,3,4],[0,0,1,1]),'pearson').value,0.8944271909999159);
close(stats.coefficient(pairs([1,2,2,4],[1,2,3,4]),'spearman').value,0.9486832980505138);
const metric={key:'emptyRetry',field:'empty_retry',label:'空夹次数'};
const run=(x,success,status='confirmed',score=success)=>({c:{
  run_id:'r',task:'t',metrics:{emptyRetry:x,success,score},
  metricStatus:{empty_retry:status,success:'confirmed',score:'confirmed'}
}});
const group={id:'test',name:'test',color:'#58A165',runs:[
  run(0,0),run(1,1),run(2,1,'lower_bound'),run(null,0),run(1,0,'unknown'),
  run(1,null),run(Infinity,1),run(1,2),run(1,0,'pending'),run(1,0,'na'),
  run(3,1,undefined),
]};
assert.equal(stats.observations(group,metric,'success','available').length,4);
assert.equal(stats.observations(group,metric,'success','confirmed').length,3);
assert.equal(stats.observations({...group,audit_completion:'pending'},metric,'success','available').length,0);
const separateScore={...group,runs:[run(0,null,'confirmed',0.5),run(1,1,'confirmed',null)]};
assert.equal(stats.observations(separateScore,metric,'success','available').length,1);
assert.equal(stats.observations(separateScore,metric,'score','available').length,1);
const doc=JSON.parse(fs.readFileSync('audit-data.json','utf8'));
const series=doc.groups.map(g=>({...g,color:'#58A165',runs:g.cases.map(c=>({c}))}));
const options={series,definitions:doc.protocol.metrics,escape:s=>String(s??'')};
let html=stats.render(options);
assert.ok(html.includes('data-correlation-metric="actionsPerTurn"'));
assert.ok(!html.includes('data-correlation-metric="success"'));
assert.equal((html.match(/data-correlation-group="semantic"/g)||[]).length,25);
assert.ok(!html.includes('NaN'));
stats.view.target='score';
html=stats.render({...options,series:[{...series[0],runs:[series[0].runs[0]]}]});
assert.ok(html.includes('n=1/1'));
assert.ok(html.includes('少于3条配对样本'));
const aux={key:'actionsPerTurn',fields:['actions','turns']};
assert.equal(stats.observations({runs:[{c:{metrics:{actions:null,turns:2,success:1}}}]},aux,'success','available').length,0);
const unclassified=run(3,1);
delete unclassified.c.metricStatus;
assert.equal(stats.observations({runs:[unclassified]},metric,'success','available')[0].unclassified,true);
assert.equal(stats.observations({runs:[unclassified]},metric,'success','confirmed').length,0);
console.log('Correlation statistics, ties, missingness, quality, constant outcomes and scoped rendering passed.');
