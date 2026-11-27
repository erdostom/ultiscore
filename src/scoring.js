import Big from 'big.js';

export const presets = ['0.2', '0.25', '0.5', '1', '20', '25', '50', '100'];
export const defaultMultiplier = '0.25';

const integerPattern = /^[+-]?\d+$/;
const decimalPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const groupedInteger = /^[+-]?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?=\.|e|$)/i;

export function decimal(raw, integerOnly = false) {
  const value = raw.trim().replace('−', '-').replace(',', '.')
    .replace(groupedInteger, group => group.replace(/\s/g, ''));
  if (!(integerOnly ? integerPattern : decimalPattern).test(value)) return null;
  // Keep scientific notation within the finite range of browser number inputs.
  if (!Number.isFinite(Number(value)) || (Number(value) === 0 && /[1-9]/.test(value.split(/e/i)[0]))) return null;
  return new Big(value.replace(/^\+/, ''));
}

export function settle(entries, multiplierText) {
  const multiplier = decimal(multiplierText);
  const rows = entries.map(({ score, adjustment }) => {
    const points = decimal(score, true);
    const extra = adjustment.trim() ? decimal(adjustment) : new Big(0);
    const needsScore = !score.trim() && extra !== null && !extra.eq(0);
    return {
      points, extra,
      invalidScore: (score.trim() !== '' && points === null) || needsScore,
      invalidAdjustment: extra === null,
      needsScore,
    };
  });
  const balance = rows.every(row => row.extra !== null)
    ? rows.reduce((sum, row) => sum.plus(row.extra), new Big(0)) : null;
  const validScores = rows.every(row => !row.invalidScore);
  const ready = validScores && multiplier !== null && balance !== null && balance.eq(0);
  const playing = rows.filter(row => row.points !== null);
  const scoreSum = playing.reduce((sum, row) => sum.plus(row.points), new Big(0));
  return {
    balance, multiplier, count: playing.length, ready,
    rows: rows.map(row => {
      // Sum of all pairwise differences, including a zero for the player's own score.
      const difference = validScores && row.points !== null ? row.points.times(playing.length).minus(scoreSum) : null;
      const subtotal = difference !== null && row.extra !== null ? difference.plus(row.extra) : null;
      const final = ready && subtotal !== null ? subtotal.times(multiplier) : null;
      return { ...row, difference, subtotal, final };
    }),
  };
}

export function format(value, signed = false) {
  if (value === null) return '–';
  const [integer, fraction] = value.toFixed().split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0').replace('-', '−');
  const number = fraction ? grouped + ',' + fraction : grouped;
  return signed && value.gt(0) ? '+' + number : number;
}

// The imported sheet uses sixths as its unit. This preserves split bonuses
// through the pairwise calculation and multiplication, including three-way ties.
export function formatSixths(value, signed = false) {
  if (value === null) return format(null);
  const [whole, fraction = ''] = value.toFixed().split('.');
  const coefficient = new Big(whole + fraction);
  if (coefficient.mod(3).eq(0)) {
    return format(coefficient.div(3).times('0.5').times('1e-' + fraction.length), signed);
  }
  // Use an ordinary reduced fraction when the decimal would recur.
  const numerator = BigInt(whole + fraction);
  const denominator = 6n * 10n ** BigInt(fraction.length);
  let a = numerator < 0n ? -numerator : numerator;
  let b = denominator;
  while (b) [a, b] = [b, a % b];
  return format(new Big(String(numerator / a)), signed) + '/' + String(denominator / a);
}

export function settleFromBook(entries, multiplier) {
  const scaled = entries.map(({ score, adjustment }) => {
    const fraction = /^(.+)\/([36])$/.exec(score.trim());
    const part = decimal(fraction ? fraction[1] : score, Boolean(fraction));
    const sixths = part?.times(fraction ? 6 / Number(fraction[2]) : 6);
    const extra = decimal(adjustment);
    return {
      score: sixths && sixths.mod(1).eq(0) ? sixths.toFixed() : score.trim() ? '?' : '',
      adjustment: extra ? extra.times(6).toFixed() : adjustment,
    };
  });
  return settle(scaled, multiplier);
}
