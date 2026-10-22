'use strict';
// @module features/data/templates — Canvases to start from that are made of data nodes
// @uses features/data/core, features/data/table, features/data/checklist, features/data/metric, features/data/chart, features/data/formula, features/data/date
// a canvas to start from: work with estimates, what must be true before launch, a number to watch, and the date
TEMPLATES.push({ id: 'tracker', name: 'Project tracker', icon: 'table', blurb: 'A table of work with estimates, a launch checklist, a metric, a chart and a countdown, all live.', build: async c => {
  const mk = (kind, dx, dy, label, parent = null) => commitNode({ kind, x: c.x + dx, y: c.y + dy, label, parent });
  const t = new Date(Date.now() + 21 * 864e5);
  const work = await mk('table', -560, -260, tableText('Work', ['Task', 'Owner', 'Days', 'Status'], [['Research', '', '3', 'Done'], ['Design', '', '5', 'Doing'], ['Build', '', '8', 'To do'], ['Test', '', '3', 'To do']]));
  await mk('chart', -560, 30, chartText({ title: 'Days by task', type: 'bar', column: 'Days', points: [] }), work);
  await mk('formula', -120, -260, formulaText({ title: 'Total days', expr: 'sum([Work.Days])', unit: 'days' }));
  await mk('date', -120, -110, dateText({ title: 'Launch', y: t.getFullYear(), mo: t.getMonth() + 1, d: t.getDate() }));
  await mk('formula', -120, 0, formulaText({ title: 'Slack', expr: '[Launch] - [Total days]', unit: 'days' }));
  await mk('checklist', 180, -260, checklistText('Before launch', [{ text: 'Pricing page live' }, { text: 'Docs updated' }, { text: 'Support briefed' }]));
  await mk('metric', 180, -20, metricText({ title: 'Teams in the beta', value: 0, target: 20 }));
} });
