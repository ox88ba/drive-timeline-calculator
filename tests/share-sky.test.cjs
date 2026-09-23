const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({
  document: { readyState: 'loading', documentElement: {}, addEventListener() {} },
  MutationObserver: class { observe() {} },
  SolarPhotography: { chinaParts(date) { const d = new Date(Date.parse(date) + 8 * 3600000); return { hour: d.getUTCHours(), minute: d.getUTCMinutes() }; } }
});
vm.runInContext(fs.readFileSync(require.resolve('../timeflow.js'), 'utf8'), context);
const sky = context.RoadbookSky;
for (const [hour, key] of [[2,'night'],[6,'dawn'],[9,'morning'],[12,'noon'],[15,'afternoon'],[18,'dusk'],[21,'evening']]) {
  const result = sky.forTime(`2026-09-30T${String(hour).padStart(2,'0')}:00:00+08:00`);
  assert.equal(result.key, key);
  assert.ok(result.background.includes('linear-gradient'));
  assert.ok(result.ink);
}
assert.equal(sky.forTime(null), null);
assert.equal(sky.forTime('bad-date'), null);
console.log('share-sky: all tests passed');
