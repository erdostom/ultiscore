import Big from 'big.js';
import { decimal, format } from './scoring.js';

export const marks = ['u', '#'];
export const markNames = { u: 'Kicsi ulti', '#': 'Kicsi betli vagy 40/100' };

export function defaultRules(count) {
  return { limit: count * 6, bonus: '50', enabled: { u: true, '#': true }, penalty: { u: '-220', '#': '-110' } };
}

export function newRound(rules) {
  return { rules: structuredClone(rules), entries: [], waived: [], finalized: false };
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function integer(value, message) {
  const parsed = typeof value === 'string' && decimal(value, true);
  requireValue(parsed, message);
  return parsed;
}

export function validateRules(rules) {
  requireValue(Number.isSafeInteger(rules.limit) && rules.limit >= 1, 'A partik száma pozitív egész szám legyen.');
  requireValue(integer(rules.bonus, 'A bónusz egész szám legyen.').gte(0), 'A bónusz legalább nulla legyen.');
  for (const mark of marks) {
    requireValue(integer(rules.penalty[mark], 'A büntetés egész szám legyen.').lte(0), 'A büntetés nulla vagy negatív szám legyen.');
  }
}

const zeros = count => Array.from({ length: count }, () => new Big(0));
export const waiverKey = (player, mark) => player + mark;

// The ledger is the source of truth. Replaying it also moves the dealer and
// reconstructs the score at each entry when an earlier hand is corrected.
export function replay(round, count, firstDealer) {
  const { rules } = round;
  validateRules(rules);
  const points = zeros(count);
  const extras = zeros(count);
  const earned = Array.from({ length: count }, () => new Set());
  const required = marks.filter(mark => rules.enabled[mark]);
  let dealer = firstDealer;
  let played = 0;
  let end = '';
  const history = round.entries.map((entry, index) => {
    const dealtBy = dealer;
    const { kind, player } = entry;
    requireValue(['hand', 'pass', 'adjustment'].includes(kind), 'Ismeretlen bejegyzés.');
    requireValue(kind === 'adjustment' || !end, 'Ezzel a módosítással a(z) ' + (index + 1) + '. bejegyzés már a buli vége utánra esne. Előbb javítsd a későbbi osztást.');
    if (kind !== 'pass') {
      requireValue(Number.isInteger(player) && player >= 0 && player < count, 'Válassz játékost.');
      const score = integer(entry.score, 'A játékpont egész szám legyen (lehet nulla is).');
      points[player] = points[player].plus(score);
      if (kind === 'hand') {
        requireValue(Array.isArray(entry.extras) && entry.extras.length === count, 'Minden játékos egyéni pontját add meg.');
        let balance = new Big(0);
        entry.extras.forEach((value, i) => {
          const extra = decimal(value.trim() || '0');
          requireValue(extra, 'Az egyéni pont szám legyen.');
          balance = balance.plus(extra);
          extras[i] = extras[i].plus(extra);
        });
        requireValue(balance.eq(0), 'Az egyéni pontok összege nulla legyen. A jelenlegi összeg ' + format(balance, true) + '.');
        for (const mark of entry.marks) {
          requireValue(marks.includes(mark) && !earned[player].has(mark), 'Ez a jel már szerepel ennél a játékosnál ebben a buliban.');
          earned[player].add(mark);
        }
        dealer = (dealer + 1) % count;
        if (!score.eq(0)) played++;
        if (required.length && earned.every(set => required.every(mark => set.has(mark)))) end = 'marks';
        else if (played === rules.limit) end = 'limit';
      }
    }
    return { dealer: dealtBy, played, points: points.slice(), extras: extras.slice() };
  });

  const penalties = points.map((_, i) => required.reduce((sum, mark) =>
    earned[i].has(mark) || round.waived.includes(waiverKey(i, mark)) ? sum : sum.plus(rules.penalty[mark]), new Big(0)));
  const ranked = points.map((value, i) => value.plus(penalties[i]));
  const high = ranked.reduce((a, b) => a.gt(b) ? a : b);
  const low = ranked.reduce((a, b) => a.lt(b) ? a : b);
  const firstCount = ranked.filter(value => value.eq(high)).length;
  const lastCount = ranked.filter(value => value.eq(low)).length;
  // Up to four players: a nontrivial tie can split a bonus in halves or thirds.
  // Keep sixths throughout the session so three equal shares still sum exactly.
  const pool = new Big(rules.bonus).times(6);
  const bonusSixths = ranked.map(value => {
    if (high.eq(low)) return new Big(0);
    if (value.eq(high)) return pool.div(firstCount);
    if (value.eq(low)) return pool.div(lastCount).neg();
    return new Big(0);
  });
  const finalSixths = ranked.map((value, i) => value.times(6).plus(bonusSixths[i]));
  requireValue(!round.finalized || end, 'A buli még nem zárható le.');
  return { points, extras, earned, dealer, played, end, history, penalties, ranked, bonusSixths, finalSixths,
    remaining: end ? 0 : rules.limit - played };
}

export function standings(session) {
  const count = session.players.length;
  let dealer = session.players.findIndex(player => player.id === session.firstDealer);
  requireValue(count >= 2 && count <= 4 && dealer >= 0, 'Érvénytelen játékossorrend.');
  let overallSixths = zeros(count);
  let overallExtras = zeros(count);
  return session.rounds.map(round => {
    const result = replay(round, count, dealer);
    dealer = result.dealer;
    const scoreSixths = round.finalized ? result.finalSixths : result.points.map(value => value.times(6));
    overallSixths = scoreSixths.map((value, i) => value.plus(overallSixths[i]));
    overallExtras = result.extras.map((value, i) => value.plus(overallExtras[i]));
    return { ...result, scoreSixths, overallSixths, overallExtras };
  });
}
