import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMultiplier, format, presets, settle } from '../src/scoring.js';

function game(scores, adjustments = [], factor = defaultMultiplier) {
  return settle(scores.map((score, i) => ({ score, adjustment: adjustments[i] ?? '' })), factor);
}
const results = game => game.rows.map(row => row.final?.toString() ?? null);

test('settles the original pairwise differences across entered slots only', () => {
  assert.deepEqual(results(game(['10', '', '4', '-2'], [], '1')), ['18', null, '0', '-18']);
  assert.deepEqual(results(game(['', '', '', ''])), [null, null, null, null]);
  assert.deepEqual(results(game(['0', '', '', ''])), ['0', null, null, null]);
  assert.deepEqual(results(game(['2', '2', '2', '2'])), ['0', '0', '0', '0']);
});

test('adds each individual adjustment after the differences, then multiplies', () => {
  assert.deepEqual(results(game(['10', '4', '-2', ''], ['2', '-1', '-1'])), ['5', '-0.25', '-4.75', null]);
  assert.deepEqual(results(game(['0', '0'], ['2', '-2'], '-1.5')), ['-3', '3']);
  assert.deepEqual(results(game(['5', '2'], [], '0')), ['0', '0']);
});

test('accepts exact balanced decimals and rejects even small imbalances', () => {
  assert.deepEqual(results(game(['0', '0', '0'], ['0,1', '0.2', '-0.3'], '1e-2')), ['0.001', '0.002', '-0.003']);
  const imbalance = game(['0','0'], ['1', '-0.99999999999999']);
  assert.equal(imbalance.balance.eq('1e-14'), true);
  assert.deepEqual(results(imbalance), [null, null]);
});

test('incomplete or invalid input withholds results until corrected', () => {
  assert.equal(game(['', '4'], ['1', '-1']).rows[0].needsScore, true);
  for (const calculation of [game(['1','2'], ['1']), game(['3.5','2']), game(['2','-']),
    game(['0','0'], ['-', '0']), game(['1','2'], [], ''), game(['1','2'], [], 'nope')]) {
    assert.deepEqual(results(calculation), [null, null]);
  }
});

test('uses the requested default and presets and formats Hungarian signed scores', () => {
  assert.deepEqual(presets, ['0.25','0.5','1','20','25','50','100']);
  assert.equal(defaultMultiplier, '0.25');
  const scores = game(['10', '5'], [], '0,125').rows;
  assert.equal(format(scores[0].final, true), '+0,625');
  assert.equal(format(scores[1].final, true), '−0,625');
});

test('shows the adjusted subtotal before the multiplier, even while balancing the sheet', () => {
  const partial = game(['3000', '1000', ''], ['500']).rows;
  assert.equal(format(partial[0].difference, true), '+2\u00a0000');
  assert.equal(format(partial[0].subtotal, true), '+2\u00a0500');
  assert.equal(partial[0].final, null);
  assert.equal(partial[2].subtotal, null);
  assert.equal(game(['3000', '1000'], ['500', '-500'], '').rows[0].subtotal.eq(2500), true);
});

test('round-trips grouped Hungarian numbers without losing precision', () => {
  const scores = game(['9 007 199 254 740 993', '9\u202f007\u202f199\u202f254\u202f739\u202f993'],
    ['−1\u00a0000,0001', '1000.0001'], '10 000').rows;
  assert.equal(format(scores[0].extra), '−1\u00a0000,0001');
  assert.equal(format(scores[0].subtotal), '−0,0001');
  assert.equal(format(scores[0].final), '−1');
  assert.equal(format(scores[1].final, true), '+1');
  for (const invalid of ['12 34', '1 234 56', '1 234,5']) {
    assert.equal(game([invalid, '0']).rows[0].invalidScore, true);
  }
  assert.equal(game(['1', '0'], [], '0,1 23').multiplier, null);
});
