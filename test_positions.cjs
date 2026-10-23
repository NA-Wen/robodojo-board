const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window: {}};
vm.runInNewContext(fs.readFileSync('charts.js', 'utf8'), context);
const render = groups => context.window.renderBehaviorOverview({
  groups, runs: groups.flatMap(g => g.cases.map(c => ({g, c}))),
  escape: s => String(s ?? ''), settings: ''
});
const data = JSON.parse(fs.readFileSync('audit-data.json', 'utf8'));
const html = render(data.groups);
assert.match(html, /data-position-group="semantic" data-position-basis="video" data-position-counts="15,17,24,17,9"/);
assert.match(html, />82\/82<\/span>/);
assert.match(html, /data-position-group="semantic" data-position-basis="decisions" data-position-counts="13,11,14,14,4"/);
assert.match(html, />56\/82<\/span>/);
const semantic = data.groups.find(g => g.id === 'semantic');
const subset = {...semantic, cases: [semantic.cases.find(c => c.metrics.emptyRetry > 0)]};
const subsetHtml = render([subset]);
const count = subset.cases[0].events.filter(e => ['empty_retry','drop'].includes(e.category)).length;
assert.match(subsetHtml, new RegExp(`>${count}/${count}</span>`));
// Protocol turns are one-based. Their boundary belongs to the following quintile.
const sample = structuredClone(subset);
sample.cases[0].metrics.turns = 10;
sample.cases[0].video_duration_seconds = 10;
sample.cases[0].events = [1, 3, 5, 7, 9, 10].map(turn => ({
  category: 'drop', turns: [turn], time_range: [turn - 1, turn]
}));
let edge = render([sample]);
assert.match(edge, /data-position-basis="decisions" data-position-counts="1,1,1,1,2"/);
sample.cases[0].events = [
  {category: 'drop', turns: [0], time_range: [null, 1]},
  {category: 'drop', turns: [11], time_range: [2, 11]},
  {category: 'drop', turns: [], time_range: [3, 2]},
];
edge = render([sample]);
assert.equal((edge.match(/>0\/3 ⚠<\/span>/g) || []).length, 2);
console.log('Position charts: full scope, task scope, boundaries, and missing evidence passed.');
