import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRules, newRound, replay, standings } from '../src/scorebook.js';
import { decimal, format, formatSixths, settleFromBook } from '../src/scoring.js';

function session(count, firstDealer = 0) {
  return {
    players: Array.from({ length: count }, (_, id) => ({ id, name: String(id) })),
    firstDealer, rounds: [newRound(defaultRules(count))],
  };
}
function hand(count, player, score, marks = [], extras = Array(count).fill('')) {
  return { kind: 'hand', player, score, marks, extras };
}
const adjustment = (player, score) => ({ kind: 'adjustment', player, score });
const strings = values => values.map(value => value.toFixed());

test('pass, zero hand and correction affect the dealer, marks and parti count independently', () => {
  const s = session(3, 2);
  const r = s.rounds[0];
  assert.equal(r.rules.limit, 18);
  r.entries.push({ kind: 'pass' }, hand(3, 1, '0', ['#'], ['−2,5', '1', '1.5']), adjustment(0, '-12'));
  const [state] = standings(s);
  assert.deepEqual(state.history.map(row => row.dealer), [2, 2, 0]);
  assert.equal(state.dealer, 0);
  assert.equal(state.remaining, 18);
  assert.deepEqual([...state.earned[1]], ['#']);
  assert.deepEqual(strings(state.points), ['-12', '0', '0']);
  assert.deepEqual(strings(state.extras), ['-2.5', '1', '1.5']);
  r.entries.push(hand(3, 0, '-4'));
  assert.equal(standings(s)[0].remaining, 17);
  assert.deepEqual(strings(standings(s)[0].points), ['-16', '0', '0']);
  r.entries.push(hand(3, 1, '1', ['#']));
  assert.throws(() => standings(s), /már szerepel/);
});

test('an uncounted hand can finish the requirements and a correction can reopen play', () => {
  const r = newRound(defaultRules(2));
  r.entries = [hand(2, 0, '7', ['u', '#']), hand(2, 1, '0', ['u', '#'])];
  let state = replay(r, 2, 1);
  assert.equal(state.end, 'marks');
  assert.equal(state.played, 1);
  assert.equal(state.remaining, 0);
  r.entries[0].marks = ['#'];
  state = replay(r, 2, 1);
  assert.equal(state.end, '');
  assert.equal(state.remaining, 11);
  r.rules.enabled.u = false;
  assert.equal(replay(r, 2, 1).end, 'marks');
  r.rules.enabled['#'] = false;
  assert.equal(replay(r, 2, 1).end, '');
});

test('individual points must balance exactly, and regular scores must be signed integers', () => {
  const r = newRound(defaultRules(3));
  r.entries = [hand(3, 0, '+5', [], ['-.3', '0,1', '0.2'])];
  assert.doesNotThrow(() => replay(r, 3, 0));
  r.entries[0].extras[1] = '.1000000000000000001';
  assert.throws(() => replay(r, 3, 0), /összege nulla/);
  r.entries[0].score = '0,5';
  assert.throws(() => replay(r, 3, 0), /egész szám/);
});

test('closing ranks after corrections and selected penalties, independent of individual points', () => {
  const s = session(3);
  const r = s.rounds[0];
  r.rules.limit = 1;
  r.entries = [hand(3, 0, '100', ['u'], ['-2000', '2000', '0']), adjustment(2, '15')];
  r.waived = ['1u', '1#', '2#'];
  const preview = standings(s)[0];
  assert.equal(preview.end, 'limit');
  assert.deepEqual(strings(preview.penalties), ['-110', '0', '-220']);
  assert.deepEqual(strings(preview.ranked), ['-10', '0', '-205']);
  assert.deepEqual(preview.finalSixths.map(n => formatSixths(n)), ['−10', '50', '−255']);
  assert.deepEqual(strings(preview.overallSixths), ['600', '0', '90']);
  r.finalized = true;
  const saved = JSON.parse(JSON.stringify(s));
  assert.deepEqual(strings(standings(saved)[0].overallSixths), strings(preview.finalSixths));
  r.entries.push({ kind: 'pass' });
  assert.throws(() => standings(s), /buli vége utánra/);
});

test('three-way bonus shares transfer exactly and cancel across successive bulis', () => {
  const s = session(4, 2);
  const r = s.rounds[0];
  r.rules.limit = 1;
  r.rules.enabled = { u: false, '#': false };
  r.entries = [hand(4, 3, '-10', [], ['-.25', '.25', '', ''])];
  r.finalized = true;
  let state = standings(s)[0];
  assert.deepEqual(state.scoreSixths.map(n => formatSixths(n)), ['50/3', '50/3', '50/3', '−60']);
  const entries = state.overallSixths.map((points, i) => ({
    score: formatSixths(points), adjustment: format(state.overallExtras[i]),
  }));
  const result = settleFromBook(entries, '0,25');
  assert.equal(result.ready, true);
  assert.equal(result.rows.reduce((sum, row) => sum.plus(row.final), decimal('0')).eq(0), true);
  assert.equal(formatSixths(result.rows[3].final), '−57,5');
  assert.equal(formatSixths(result.rows[0].final), '917/48');
  const next = newRound(r.rules);
  s.rounds.push(next);
  state = standings(s)[1];
  assert.equal(state.dealer, 3);
  assert.deepEqual(strings(state.points), ['0', '0', '0', '0']);
  assert.deepEqual(strings(state.overallSixths), ['100', '100', '100', '-360']);
  next.entries = [hand(4, 3, '10')];
  next.finalized = true;
  state = standings(s)[1];
  assert.deepEqual(strings(state.overallSixths), ['0', '0', '0', '0']);
  assert.deepEqual(strings(state.overallExtras), ['-0.25', '0.25', '0', '0']);
  // Editing the old hand replays both the totals and the inherited dealer.
  r.entries.unshift(hand(4, 0, '0'));
  r.entries[1].score = '-12';
  state = standings(s)[1];
  assert.equal(state.history[0].dealer, 0);
  assert.deepEqual(strings(state.overallSixths), ['0', '0', '0', '-12']);
});

test('two-way ties share an odd bonus equally and a complete tie has no net bonus', () => {
  const r = newRound(defaultRules(4));
  r.rules.bonus = '51';
  r.rules.limit = 2;
  r.rules.enabled = { u: false, '#': false };
  r.entries = [hand(4, 0, '2'), hand(4, 1, '2')];
  let state = replay(r, 4, 0);
  assert.deepEqual(state.bonusSixths.map(n => formatSixths(n)), ['25,5', '25,5', '−25,5', '−25,5']);
  r.entries.push(adjustment(2, '2'), adjustment(3, '2'));
  state = replay(r, 4, 0);
  assert.deepEqual(strings(state.bonusSixths), ['0', '0', '0', '0']);
});
