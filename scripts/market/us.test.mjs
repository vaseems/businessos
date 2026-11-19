// Offline checks for the rule-based NYSE holiday calendar. Run: node scripts/market/us.test.mjs
import assert from 'node:assert/strict';
import { nyseHolidays } from './lib.mjs';
const days = (y) => nyseHolidays(y).map((h) => h.day);
assert.deepEqual(days(2026), ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']);
assert.deepEqual(days(2027), ['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
assert.deepEqual(days(2025), ['2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25']);
assert.deepEqual(days(2028).slice(0, 2), ['2028-01-17', '2028-02-21'], "Jan 1 2028 is a Saturday: not observed on Dec 31 2027");
console.log('nyse holiday rules ok');
