import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource/dm-serif-text/latin-400.css';
import '@fontsource/dm-serif-text/latin-ext-400.css';
import './styles.css';
import './scorebook.css';
import { decimal, defaultMultiplier, format, formatSixths, presets, settle, settleFromBook } from './scoring.js';
import { initScorebook } from './scorebook-ui.js';
import { enhanceNumbers } from './number-fields.js';

let bookNames = null;
const byId = id => document.getElementById(id);
const drawings = {
  info: '<circle cx="12" cy="12" r="8.8"/><path d="M12 10.8v5.4m0-8V8"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M2.5 19v-1a6.5 6.5 0 0 1 13 0v1m.3-14a3.1 3.1 0 0 1 0 6m2 2.4a5 5 0 0 1 3.4 4.8V19"/>',
  sum: '<path d="M18 4H5l8 8-8 8h13"/>',
};
function icon(name) {
  return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${drawings[name]}</svg>`;
}

document.querySelector('.result-mark').innerHTML = icon('sum');
byId('player-count').innerHTML = icon('users') + '<span></span>';

byId('balance-icon').innerHTML = icon('info');

const fields = Array.from({ length: 4 }, (_, index) => {
  const n = index + 1;
  const row = document.createElement('div');
  row.className = 'entry-grid entry';
  row.innerHTML = `<strong class="identity">${n}. játékos</strong>
    <input id="score-${n}" type="text" inputmode="decimal" aria-label="${n}. játékos játékpontja" autocomplete="off" spellcheck="false" placeholder="–" />
    <input id="adjust-${n}" type="text" inputmode="decimal" aria-label="${n}. játékos egyéni pontja" autocomplete="off" spellcheck="false" placeholder="0" />`;
  byId('entries').append(row);

  const result = document.createElement('li');
  result.innerHTML = `<span class="result-label">${n}. játékos</span>
    <output for="score-${n} adjust-${n} multiplier custom" aria-label="${n}. játékos végeredménye" aria-live="off">–</output>`;
  byId('totals').append(result);
  const steps = byId('steps').tBodies[0].insertRow();
  steps.innerHTML = `<th scope="row">${n}.<span class="player-word"> játékos</span></th><td></td><td></td><td></td>`;
  const pair = document.createElement('div');
  pair.innerHTML = `<dt>${n}. játékos</dt><dd></dd>`;
  byId('pair-equations').append(pair);
  return {
    score: byId('score-' + n), adjustment: byId('adjust-' + n), steps, pair,
    result: result.querySelector('output'),
  };
});

const multiplier = byId('multiplier');
const custom = byId('custom');
for (const value of presets) multiplier.add(new Option(value.replace('.', ',') + ' ×', value));
multiplier.add(new Option('Egyéni', 'custom'));
multiplier.value = defaultMultiplier;

const storageKey = 'ultiscore.multiplier.v1';
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && (presets.includes(saved.choice) || (saved.choice === 'custom' && typeof saved.custom === 'string' && decimal(saved.custom)))) {
    multiplier.value = saved.choice;
    const savedCustom = typeof saved.custom === 'string' ? decimal(saved.custom) : null;
    custom.value = savedCustom === null ? '' : format(savedCustom);
  }
} catch { /* The calculator also works with browser storage disabled. */ }

function saveMultiplier() {
  if (multiplier.value === 'custom' && !decimal(custom.value)) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ choice: multiplier.value, custom: custom.value }));
  } catch { /* Keep using the setting for this page. */ }
}

function markInvalid(input, invalid, description) {
  input.setAttribute('aria-invalid', String(invalid));
  if (invalid) input.setAttribute('aria-describedby', description);
  else input.removeAttribute('aria-describedby');
}

function render() {
  const isCustom = multiplier.value === 'custom';
  byId('custom-setting').hidden = !isCustom;
  const entries = fields.map(({ score, adjustment }) => ({ score: score.value, adjustment: adjustment.value }));
  const display = bookNames ? formatSixths : format;
  const game = (bookNames ? settleFromBook : settle)(entries, isCustom ? custom.value : (multiplier.value || defaultMultiplier));
  const errors = [];
  fields.forEach(({ score, adjustment, result, steps, pair }, i) => {
    const row = game.rows[i];
    const name = bookNames?.[i] || `${i + 1}. játékos`;
    markInvalid(score, row.invalidScore, 'entry-error');
    markInvalid(adjustment, row.invalidAdjustment, 'entry-error');
    const article = i === 0 ? 'Az' : 'A';
    if (row.needsScore) errors.push(`${article} ${i + 1}. játékos egyéni pontjához adj meg játékpontot is (akár nullát).`);
    else if (row.invalidScore && bookNames) errors.push(`${name} játékpontja egész szám vagy osztott bónuszt tartalmazó pontszám legyen.`);
    else if (row.invalidScore) errors.push(`${article} ${i + 1}. játékos játékpontja egész szám legyen.`);
    if (row.invalidAdjustment) errors.push(`${article} ${i + 1}. játékos egyéni pontja szám legyen.`);
    steps.hidden = row.points === null;
    steps.cells[1].textContent = display(row.difference, true);
    steps.cells[2].textContent = display(row.extra, true);
    steps.cells[3].textContent = display(row.subtotal, true);
    pair.hidden = row.difference === null;
    const terms = game.rows.flatMap((opponent, j) => {
      if (i === j || row.difference === null || opponent.points === null) return [];
      const other = display(opponent.points);
      const operand = opponent.points.lt(0) ? '(' + other + ')' : other;
      return [`(${display(row.points)} − ${operand})`];
    });
    pair.lastElementChild.textContent = terms.length ? terms.join(' + ') + ' = ' + display(row.difference, true) : '';
    const sign = row.final === null ? 'pending' : row.final.gt(0) ? 'positive' : row.final.lt(0) ? 'negative' : '';
    result.parentElement.hidden = row.points === null;
    result.value = display(row.final, true);
    result.className = sign;
  });
  byId('steps').hidden = game.count === 0;
  byId('steps-empty').hidden = game.count > 0;
  byId('pairs').hidden = game.count < 2 || game.rows.some(row => row.invalidScore);
  byId('player-count').lastElementChild.textContent = game.count + ' / 4 játékos';
  const showBalance = game.balance !== null && !game.balance.eq(0);
  byId('balance-box').hidden = !showBalance;
  byId('balance-hint').hidden = !showBalance;
  byId('balance').textContent = display(game.balance, true);
  byId('balance-hint').textContent = showBalance
    ? `A nullához még ${display(game.balance.neg(), true)} egyéni pontot kell elosztani.` : '';
  byId('entry-error').hidden = !errors.length;
  byId('entry-error').textContent = errors.join(' ');
  markInvalid(custom, !game.multiplier, 'custom-error');
  byId('custom-error').hidden = !!game.multiplier;
  const summary = game.rows.map((row, i) => row.final === null ? '' : `${bookNames?.[i] || (i + 1) + '. játékos'}: ${display(row.final, true)}`).filter(Boolean);
  byId('notice').textContent = [...errors, ...(showBalance ? [byId('balance-hint').textContent] : []),
    ...(!game.multiplier ? [byId('custom-error').textContent] : []), ...summary].join(' ');
}

enhanceNumbers(byId('calculator'));

byId('entries').addEventListener('input', render);
custom.addEventListener('input', () => { render(); saveMultiplier(); });
multiplier.addEventListener('change', () => {
  render();
  saveMultiplier();
  if (multiplier.value === 'custom') custom.focus();
});
render();

function fillCalculator(rows) {
  bookNames = rows ? rows.map(row => row.name) : null;
  fields.forEach(({ score, adjustment, steps, result, pair }, i) => {
    const name = bookNames?.[i] || (i + 1) + '. játékos';
    score.closest('.entry').querySelector('.identity').textContent = name;
    result.previousElementSibling.textContent = name;
    if (bookNames) steps.cells[0].textContent = name;
    pair.firstElementChild.textContent = name;
    score.value = rows?.[i]?.score ?? '';
    adjustment.value = rows?.[i]?.extra ?? '';
    score.setAttribute('aria-label', name + ' játékpontja');
    adjustment.setAttribute('aria-label', name + ' egyéni pontja');
    result.setAttribute('aria-label', name + ' végeredménye');
    if (!bookNames) steps.cells[0].innerHTML = (i + 1) + '.<span class="player-word"> játékos</span>';
  });
  render();
}

const book = initScorebook({
  transfer(rows) {
    fillCalculator(rows);
    location.hash = 'elszamolo/naplo';
  },
  reset() {
    if (bookNames) fillCalculator(null);
  },
});

function showTab() {
  const log = location.hash === '#partinaplo';
  byId('calculator').hidden = log;
  byId('scorebook').hidden = !log;
  byId('title').textContent = log ? 'Partinapló' : 'Ulti elszámoló';
  for (const link of document.querySelectorAll('.tabs a')) {
    if (link.hash === (log ? '#partinaplo' : '#elszamolo')) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (location.hash === '#elszamolo/naplo' && !bookNames) {
    const rows = book.exportRows();
    if (rows) fillCalculator(rows);
  }
}
window.addEventListener('hashchange', showTab);
showTab();
