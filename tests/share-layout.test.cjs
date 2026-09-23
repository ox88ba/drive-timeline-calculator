const assert = require('node:assert/strict');
const L = require('../share-layout.js');
assert.equal(L.dayKey('2026-12-31T17:00:00Z'), '2027-01-01');
assert.equal(L.dayKey(null), '');
assert.equal(L.dateTime('2026-09-30T10:00:00Z'), '2026/09/30 18:00');
assert.equal(L.filename('a/b:c*?"<>|\u0000. '), 'abc');
assert.equal(Array.from(L.filename('🌙'.repeat(60))).length, 50);
const model = { start: { departureIso:'2026-12-31T22:00:00+08:00' }, destinations: [
  { arrivalIso:'2027-01-01T02:00:00+08:00', departureIso:'2027-01-01T08:00:00+08:00' },
  { arrivalIso:'2027-01-01T09:00:00+08:00', departureIso:'2027-01-01T09:00:00+08:00' },
  { arrivalIso:'2027-01-01T10:00:00+08:00', departureIso:'2027-01-01T10:00:00+08:00' }
] };
const days = L.daily(model);
assert.equal(days.length, 2);
assert.equal(days.reduce((n, d) => n + d.drive, 0), 360);
assert.equal(days.reduce((n, d) => n + d.stay, 0), 360);
assert.equal(days.reduce((n, d) => n + d.nightDrive, 0), 180);
assert.deepEqual(L.pageRanges(8000, [1000, 2900, 4100, 6100, 7600]), [
  { top:0, height:2900 }, { top:2900, height:3200 }, { top:6100, height:1900 }
]);
for (const height of [1, 3600, 3601, 15000, 80000]) {
  const ranges = L.pageRanges(height, []);
  assert.equal(ranges.reduce((n,r) => n + r.height, 0), height);
  assert(ranges.every(r => r.height <= 3600 && r.height > 0));
}
model.destinations[1].arrivalIso = null;
assert.equal(L.daily(model).reduce((n, d) => n + d.drive, 0), 240);
console.log('share-layout: all tests passed');
