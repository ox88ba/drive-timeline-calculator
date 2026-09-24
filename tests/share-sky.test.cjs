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
  assert.doesNotMatch(result.background, /transparent 70%/);
  assert.match(result.background, /rgba\([\d,]+,0\) 70%/);
}
assert.equal(sky.forTime(null), null);
assert.equal(sky.forTime('bad-date'), null);
// Export times must retain light sky ink instead of the legacy dark strong rule.
assert.equal(sky.forTime('2026-09-26T02:14:00+08:00').ink, '#e9edf6');
const css = fs.readFileSync(require.resolve('../share-v2.css'), 'utf8');
assert.match(css, /html #sharePoster\.rb-poster \.rb-sky \.rb-time-line strong\s*\{\s*color:var\(--rb-sky-ink\)/);
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
assert.doesNotMatch(html.match(/<input id="shareIncludeMap"[^>]*>/)[0], /\bchecked\b/);
const share = fs.readFileSync(require.resolve('../share-v2.js'), 'utf8');
assert.match(share, /\$\('#shareIncludeMap'\)\.checked = false/);
assert.doesNotMatch(share, /\$\('#shareIncludeMap'\)\.checked = true/);
console.log('share-sky: all tests passed');
