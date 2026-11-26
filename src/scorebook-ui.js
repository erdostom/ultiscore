import { decimal, format, formatSixths } from './scoring.js';
import { defaultRules, markNames, marks, newRound, standings, validateRules, waiverKey } from './scorebook.js';
import { enhanceNumbers } from './number-fields.js';

const key = 'ultiscore.partinaplo.v1';
const esc = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const checked = value => value ? ' checked' : '';
const disabled = value => value ? ' disabled' : '';

function emptySession() {
  return {
    players: [0, 1, 2].map(id => ({ id, name: '' })), firstDealer: 0,
    rules: defaultRules(3), rounds: [], selected: 0,
  };
}

function numberField(name, label, value = '', integerOnly = false, placeholder = '0') {
  return `<label class="field" for="book-${name}"><span>${esc(label)}</span>
    <input id="book-${name}" name="${name}" aria-label="${esc(label)}" type="text" inputmode="decimal"
    autocomplete="off" spellcheck="false" value="${esc(value)}" placeholder="${placeholder}"${integerOnly ? ' data-integer' : ''}></label>`;
}

function scoreTable(players, sixths, extras, requirements, earned) {
  return `<table class="book-table"><thead><tr><th scope="col">Játékos</th><th scope="col">Játékpont</th><th scope="col">Egyéni pont</th>
    ${requirements.map(mark => `<th scope="col" class="mark-cell"><abbr title="${markNames[mark]}">${mark}</abbr></th>`).join('')}
    </tr></thead><tbody>${players.map(({ name }, i) => `<tr><th scope="row">${esc(name)}</th>
    <td class="points">${formatSixths(sixths[i], true)}</td><td>${format(extras[i], true)}</td>
    ${requirements.map(mark => `<td class="mark-cell"><span class="stamp ${earned[i].has(mark) ? 'met' : ''}"
    aria-label="${markNames[mark]} ${earned[i].has(mark) ? 'teljesítve' : 'hiányzik'}">${earned[i].has(mark) ? '✓' : '–'}</span></td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

export function initScorebook({ transfer, reset }) {
  const root = document.getElementById('scorebook');
  const dialog = document.getElementById('book-dialog');
  const warning = document.getElementById('storage-warning');
  function warn(message) {
    warning.hidden = !message;
    warning.textContent = message;
  }
  let session = emptySession();
  function load(raw) {
    const saved = raw ? JSON.parse(raw) : emptySession();
    validateRules(saved.rules);
    if (!saved.players.every(p => Number.isInteger(p.id) && typeof p.name === 'string') ||
        new Set(saved.players.map(p => p.id)).size !== saved.players.length ||
        !Number.isInteger(saved.selected) || saved.selected < 0 || saved.selected >= Math.max(saved.rounds.length, 1)) {
      throw new Error('Érvénytelen mentés.');
    }
    standings(saved);
    session = saved;
  }
  try {
    load(localStorage.getItem(key));
  } catch {
    warn('A korábbi mentés nem olvasható. Ellenőrizd, hogy a böngészőben elérhető-e a helyi tárhely.');
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(session));
      warn('');
    } catch {
      warn('A böngésző nem tudta menteni a naplót. Az adatok ezen az oldalon az újratöltésig érhetők el.');
    }
  }
  const round = () => session.rounds[session.selected];
  const current = () => standings(session)[session.selected];

  function setup() {
    const { players, firstDealer, rules } = session;
    return `<section class="panel setup-panel">
      <div class="panel-head"><h2>Játékosok</h2><button class="quiet" data-action="settings">Beállítások</button></div>
      <div class="setup-count"><span id="count-label">Játékosok száma</span><div class="segments" role="group" aria-labelledby="count-label">
      ${[2, 3, 4].map(n => `<button data-action="count" data-count="${n}" aria-pressed="${n === players.length}">${n}</button>`).join('')}</div></div>
      <div class="seat-head"><span>Osztási sorrend</span><span>Első osztó</span></div>
      <div class="seats">${players.map((player, i) => `<div class="seat" data-seat="${player.id}">
        <span class="grip" data-grip title="Átrendezés húzással" aria-hidden="true">⠿</span>
        <input type="text" class="player-name" data-name="${player.id}" aria-label="${i + 1}. játékos neve" autocomplete="off"
        placeholder="${i + 1}. játékos neve" value="${esc(player.name)}">
        <div class="move-buttons"><button data-action="move" data-to="${i - 1}" aria-label="${i + 1}. játékos előrébb"${disabled(i === 0)}>↑</button>
        <button data-action="move" data-to="${i + 1}" aria-label="${i + 1}. játékos hátrébb"${disabled(i === players.length - 1)}>↓</button></div>
        <label class="dealer-radio"><input type="radio" name="first-dealer" value="${player.id}"${checked(player.id === firstDealer)}
        aria-label="Első osztó: ${esc(player.name || (i + 1) + '. játékos')}"></label></div>`).join('')}</div>
      <p class="hint">Húzással vagy a nyilakkal állíthatod az osztási sorrendet.</p>
      <p class="error" id="setup-error" role="alert" hidden></p>
      <div class="setup-foot"><span>${rules.limit} parti / buli</span><button class="primary" data-action="start">Buli indítása</button></div>
    </section>`;
  }

  function closing(result) {
    const { players } = session;
    const { rules, waived, finalized } = round();
    const missing = players.flatMap(({ name }, i) => marks.filter(mark => rules.enabled[mark] && !result.earned[i].has(mark))
      .map(mark => {
        const id = waiverKey(i, mark);
        return `<label class="choice"><input type="checkbox" data-waiver="${id}"${checked(!waived.includes(id))}${disabled(finalized)}>
          <span>${esc(name)} · hiányzó <b>${mark}</b></span><b>${format(decimal(rules.penalty[mark]))}</b></label>`;
      }));
    return `<section class="panel closing"><div class="panel-head"><h2>${finalized ? 'Buli eredménye' : 'Buli lezárása'}</h2></div>
      <p class="book-note">${result.end === 'marks' ? 'Minden játékos teljesítette a beállított követelményeket.' : 'Elfogytak a partik.'}</p>
      ${missing.length ? `<fieldset class="penalties"><legend>Hiányzó jelek büntetései</legend>${missing.join('')}</fieldset>` : ''}
      <p class="hint bonus-note">A bónuszt a büntetések utáni játékpontok alapján osztjuk el.</p>
      <table class="book-table closing-table"><thead><tr><th>Játékos</th><th>Büntetés</th><th>Bónusz</th><th>Játékpont</th></tr></thead><tbody>
      ${players.map(({ name }, i) => `<tr><th scope="row">${esc(name)}</th><td>${format(result.penalties[i], true)}</td>
        <td>${formatSixths(result.bonusSixths[i], true)}</td><td class="points">${formatSixths(result.finalSixths[i], true)}</td></tr>`).join('')}</tbody></table>
      ${finalized ? '' : `<div class="book-actions"><button class="primary" data-action="finalize">Buli lezárása</button>
        <button class="quiet" data-action="adjust">Pontkorrekció</button></div>`}</section>`;
  }

  function history(result) {
    const { players } = session;
    const entries = round().entries;
    if (!entries.length) return '';
    return `<section class="panel ledger"><div class="panel-head"><h2>Bejegyzések</h2><span class="counter">${entries.length}</span></div>
      <ol class="ledger-list" reversed>${entries.map((entry, i) => {
        const snap = result.history[i];
        const isHand = entry.kind === 'hand';
        const pass = entry.kind === 'pass';
        const zero = isHand && decimal(entry.score, true).eq(0);
        const label = pass ? 'Elpasszolt' : isHand ? esc(players[entry.player].name) : 'Pontkorrekció · ' + esc(players[entry.player].name);
        const detail = pass ? 'Az osztó marad' : zero ? 'Nulla játékpont · plusz osztás' : isHand ? snap.played + '. parti' : 'Partin kívül';
        const extras = isHand ? entry.extras.flatMap((raw, p) => {
          const extra = decimal(raw || '0');
          return extra.eq(0) ? [] : [esc(players[p].name) + ' ' + format(extra, true)];
        }) : [];
        return `<li><div class="entry-summary"><div><div class="ledger-meta">${i + 1}. bejegyzés · ${detail}</div>
          <strong>${label}</strong> ${pass ? '' : `<b class="ledger-score">${format(decimal(entry.score, true), true)}</b>`}
          ${isHand ? entry.marks.map(mark => `<span class="stamp met">${mark}</span>`).join(' ') : ''}
          ${extras.length ? `<div class="ledger-meta">Egyéni pontok · ${extras.join(', ')}</div>` : ''}</div>
          <button class="quiet" data-action="edit" data-index="${i}" aria-label="${i + 1}. bejegyzés javítása">Javítás</button></div>
          <details><summary>Állás a bejegyzés után</summary><p class="hint">Osztó · ${esc(players[snap.dealer].name)}</p>
          ${scoreTable(players, snap.points.map(n => n.times(6)), snap.extras, [], [])}</details></li>`;
      }).reverse().join('')}</ol></section>`;
  }

  function dashboard() {
    const { players, rounds, selected } = session;
    const result = current();
    const active = round();
    const required = marks.filter(mark => active.rules.enabled[mark]);
    const allClosed = rounds.every(b => b.finalized);
    const last = selected === rounds.length - 1;
    const outstanding = rounds.findIndex(b => !b.finalized);
    const selector = rounds.length === 1 ? '<span class="round-label">1. buli</span>' :
      `<label class="round-label"><span class="sr-only">Buli kiválasztása</span><select id="round-select">${rounds.map((b, i) =>
        `<option value="${i}"${i === selected ? ' selected' : ''}>${i + 1}. buli${b.finalized ? ' · lezárva' : ''}</option>`).join('')}</select></label>`;
    return `<div class="book-toolbar">${selector}<button class="quiet" data-action="settings">Beállítások</button></div>
      <div class="book-layout"><section class="panel standings"><div class="panel-head"><h2>A buli állása</h2>
        <span class="counter">${active.finalized ? 'Lezárva' : result.end ? 'Lezárás előtt' : 'Játékban'}</span></div>
      <div class="metrics"><div><span>Hátralévő partik</span><strong>${result.remaining}</strong></div>
        <div><span>${result.end ? 'Következő osztó' : 'Osztó'}</span><strong>${esc(players[result.dealer].name)}</strong></div></div>
      ${scoreTable(players, result.scoreSixths, result.extras, required, result.earned)}
      ${required.length ? `<p class="mark-key">${required.map(mark => `<span><b>${mark}</b> ${markNames[mark]}</span>`).join('')}</p>` : ''}
      ${!result.end ? `<div class="book-actions"><button class="primary" data-action="hand">Parti rögzítése</button>
        <button class="quiet" data-action="adjust">Pontkorrekció</button></div>` : ''}
      ${active.finalized && last && allClosed ? `<div class="book-actions"><button class="primary" data-action="next">Új buli</button>
        <button class="secondary" data-action="transfer">Tovább az elszámolóhoz</button></div>` : ''}
      ${active.finalized && outstanding !== -1 ? `<button class="secondary" data-action="outstanding">${outstanding + 1}. buli folytatása</button>` : ''}
      </section>
      ${result.end ? closing(result) : ''}
      ${rounds.length > 1 ? `<section class="panel overall"><div class="panel-head"><h2>Összesített állás</h2></div>
        ${scoreTable(players, result.overallSixths, result.overallExtras, [], [])}
        <p class="hint">Az 1–${selected + 1}. buli pontjai összesen.</p></section>` : ''}
      ${history(result)}</div>
      <div class="session-foot"><button class="quiet danger" data-action="reset">Teljes játék törlése</button></div>`;
  }

  function render() {
    root.innerHTML = session.rounds.length ? dashboard() : setup();
  }

  function commit() {
    save();
    render();
  }

  function updateRound(change) {
    const candidate = structuredClone(round());
    change(candidate);
    const nextRounds = session.rounds.slice();
    nextRounds[session.selected] = candidate;
    standings({ ...session, rounds: nextRounds });
    session.rounds = nextRounds;
    commit();
  }

  function openForm(title, body, submitLabel, onSubmit, extra = '') {
    dialog.innerHTML = `<form novalidate><div class="panel-head"><h2 id="dialog-title">${title}</h2>
      <button type="button" class="close-dialog" aria-label="Bezárás">×</button></div>
      ${body}<p class="error form-error" role="alert" hidden></p><div class="dialog-actions">
      <button type="submit" class="primary">${submitLabel}</button><button type="button" class="quiet cancel">Mégse</button>${extra}</div></form>`;
    dialog.querySelectorAll('.close-dialog, .cancel').forEach(btn => btn.onclick = () => dialog.close());
    const form = dialog.querySelector('form');
    form.onsubmit = event => {
      event.preventDefault();
      try {
        onSubmit(new FormData(form));
        dialog.close();
      } catch (error) {
        const box = form.querySelector('.form-error');
        box.hidden = false;
        box.textContent = error.message;
      }
    };
    enhanceNumbers(form);
    dialog.showModal();
    return form;
  }

  function settings() {
    const active = round();
    const rules = active?.rules ?? session.rules;
    openForm('Buli beállításai', `
      ${numberField('limit', 'Partik száma egy buliban', rules.limit, true)}
      ${numberField('bonus', 'Bulinyerő bónusz (játékpont)', rules.bonus, true)}
      <fieldset class="rules"><legend>Követelmények</legend>${marks.map((mark, i) =>
        `<div><label class="choice"><input type="checkbox" name="mark${i}"${checked(rules.enabled[mark])}><b>${mark}</b> ${markNames[mark]}</label>
        ${numberField('penalty' + i, 'Büntetés hiányzó ' + mark + ' esetén', rules.penalty[mark], true)}</div>`).join('')}</fieldset>
      <p class="hint">A buli akkor is véget ér, ha minden játékos teljesítette az összes bekapcsolt követelményt.</p>`,
    'Mentés', data => {
      const next = defaultRules(session.players.length);
      next.limit = Number(decimal(data.get('limit'), true)?.toFixed());
      next.bonus = decimal(data.get('bonus'), true)?.toFixed() ?? '';
      marks.forEach((mark, i) => {
        next.enabled[mark] = data.has('mark' + i);
        next.penalty[mark] = decimal(data.get('penalty' + i), true)?.toFixed() ?? '';
      });
      validateRules(next);
      if (active) {
        if (JSON.stringify(next) === JSON.stringify(rules)) return;
        updateRound(candidate => { candidate.rules = next; candidate.finalized = false; });
      } else {
        session.rules = next;
        commit();
      }
    });
  }

  function entryForm(kind, index = -1) {
    const { players } = session;
    const active = round();
    const original = active.entries[index];
    const adjustment = kind === 'adjustment';
    const entry = original ?? { kind, player: -1, score: '', marks: [], extras: [] };
    const selector = `<label class="field"><span>${adjustment ? 'Játékos' : 'Felvevő'}</span>
      <select name="player"><option value="">Válassz játékost</option>${players.map(({ name }, i) =>
        `<option value="${i}"${entry.player === i ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;
    const titles = adjustment ? ['Pontkorrekció', 'Korrekció javítása'] : ['Parti rögzítése', 'Osztás javítása'];
    const required = marks.filter(mark => active.rules.enabled[mark] || entry.marks?.includes(mark));
    const hasExtras = entry.extras?.some(value => !decimal(value || '0').eq(0));
    const form = openForm(titles[original ? 1 : 0], `
      ${adjustment ? '' : `<fieldset class="type-picker"><legend class="sr-only">Osztás típusa</legend>
      <label><input type="radio" name="kind" value="hand"${checked(entry.kind !== 'pass')}>Eredmény</label>
      <label><input type="radio" name="kind" value="pass"${checked(entry.kind === 'pass')}>Elpasszolt</label></fieldset>`}
      <div class="hand-body">${selector}${numberField('score', 'Játékpont', entry.score ?? '', true, 'pl. −12')}
      ${adjustment ? '<p class="hint">A korrekció a játékos játékpontját módosítja. Az osztó és a hátralévő partik száma változatlan marad.</p>' :
        `${required.length ? `<fieldset class="entry-marks"><legend>Teljesített követelmények</legend>${required.map(mark =>
          `<label class="choice"><input name="mark" type="checkbox" value="${mark}"${checked(entry.marks?.includes(mark))}><b>${mark}</b> ${markNames[mark]}</label>`).join('')}</fieldset>` : ''}
        <details class="extras"${hasExtras ? ' open' : ''}><summary>Egyéni pontok</summary>
        ${players.map(({ name }, i) => numberField('extra' + i, name, entry.extras?.[i] || '')).join('')}
        <p class="hint extra-balance" aria-live="polite"></p></details>`}</div>
      ${adjustment ? '' : '<p class="book-note pass-note" hidden>Az osztó marad, a parti nem számít bele a buliba. A következő eredményt az emelt értékkel add meg.</p>'}`,
    original ? 'Javítás mentése' : 'Rögzítés', data => {
      const isPass = !adjustment && data.get('kind') === 'pass';
      let saved = { kind: 'pass' };
      if (!isPass) {
        const player = data.get('player') === '' ? -1 : Number(data.get('player'));
        saved = { kind: adjustment ? 'adjustment' : 'hand', player, score: data.get('score').trim() };
        if (!adjustment) {
          saved.marks = data.getAll('mark');
          saved.extras = players.map((_, i) => data.get('extra' + i).trim());
        }
      }
      updateRound(candidate => {
        candidate.finalized = false;
        if (original) candidate.entries[index] = saved;
        else candidate.entries.push(saved);
      });
    }, original ? '<button type="button" class="quiet danger delete-entry">Törlés</button>' : '');
    if (original) form.querySelector('.delete-entry').onclick = () => {
      if (!window.confirm('Törlöd ezt a bejegyzést? A pontok és az osztási sorrend újraszámolódnak.')) return;
      try {
        updateRound(candidate => { candidate.finalized = false; candidate.entries.splice(index, 1); });
        dialog.close();
      } catch (error) {
        const box = form.querySelector('.form-error');
        box.hidden = false;
        box.textContent = error.message;
      }
    };
    if (adjustment) return;
    const updateType = () => {
      const pass = form.elements.kind.value === 'pass';
      form.querySelector('.hand-body').hidden = pass;
      form.querySelector('.pass-note').hidden = !pass;
    };
    const updateMarks = () => {
      const player = form.elements.player.value;
      form.querySelectorAll('input[name="mark"]').forEach(input => {
        const taken = active.entries.some((e, i) => i !== index && e.kind === 'hand' &&
          e.player === Number(player) && e.marks.includes(input.value));
        input.disabled = player === '' || taken;
        if (input.disabled) input.checked = false;
      });
    };
    const updateBalance = () => {
      const values = players.map((_, i) => decimal(form.elements['extra' + i].value || '0'));
      const sum = values.every(Boolean) ? values.reduce((a, b) => a.plus(b)) : null;
      const balance = form.querySelector('.extra-balance');
      balance.textContent = 'Összeg: ' + format(sum, true) + ' · Az egyéni pontok összege nulla legyen.';
      balance.classList.toggle('error', sum === null || !sum.eq(0));
    };
    form.onchange = event => {
      if (event.target.name === 'kind') updateType();
      if (event.target.name === 'player') updateMarks();
    };
    form.oninput = updateBalance;
    updateType();
    updateMarks();
    updateBalance();
  }

  function move(id, to) {
    const { players } = session;
    const from = players.findIndex(player => player.id === id);
    if (from < 0 || from === to || to < 0 || to >= players.length) return;
    players.splice(to, 0, players.splice(from, 1)[0]);
    commit();
  }

  root.addEventListener('input', event => {
    const id = event.target.dataset.name;
    if (id !== undefined) {
      session.players.find(p => p.id === Number(id)).name = event.target.value;
      event.target.closest('.seat').querySelector('input[type="radio"]').setAttribute('aria-label', 'Első osztó: ' + event.target.value);
      save();
    }
  });
  root.addEventListener('change', event => {
    const input = event.target;
    if (input.name === 'first-dealer') { session.firstDealer = Number(input.value); save(); }
    if (input.id === 'round-select') { session.selected = Number(input.value); commit(); }
    if (input.hasAttribute('data-waiver')) {
      const id = input.dataset.waiver;
      updateRound(candidate => {
        candidate.waived = candidate.waived.filter(value => value !== id);
        if (!input.checked) candidate.waived.push(id);
      });
      root.querySelector(`[data-waiver="${id}"]`).focus({ preventScroll: true });
    }
  });

  // Pointer capture works on touch handles as well as with a mouse.
  let drag = null;
  root.addEventListener('pointerdown', event => {
    if (!event.target.hasAttribute('data-grip') || event.button !== 0) return;
    const seat = event.target.closest('.seat');
    drag = { seat, pointer: event.pointerId, target: null };
    seat.classList.add('dragging');
    event.target.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  root.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    drag.target?.classList.remove('drop-target');
    drag.target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.seat');
    if (drag.target !== drag.seat) drag.target?.classList.add('drop-target');
  });
  function finishDrag(event) {
    if (drag?.pointer !== event.pointerId) return;
    const { seat, target } = drag;
    drag = null;
    seat.classList.remove('dragging');
    target?.classList.remove('drop-target');
    if (event.type === 'pointerup' && target) move(Number(seat.dataset.seat),
      session.players.findIndex(p => p.id === Number(target.dataset.seat)));
  }
  root.addEventListener('pointerup', finishDrag);
  root.addEventListener('pointercancel', finishDrag);
  root.addEventListener('lostpointercapture', finishDrag);

  function exportRows() {
    if (!session.rounds.length || !session.rounds.every(b => b.finalized)) return null;
    const total = standings(session).at(-1);
    return session.players.map(({ name }, i) => ({
      name, score: formatSixths(total.overallSixths[i]), extra: format(total.overallExtras[i]),
    }));
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action } = button.dataset;
    const { players } = session;
    if (action === 'settings') settings();
    if (action === 'count') {
      const count = Number(button.dataset.count);
      if (session.rules.limit === players.length * 6) session.rules.limit = count * 6;
      while (players.length < count) players.push({ id: Math.max(...players.map(p => p.id)) + 1, name: '' });
      players.length = count;
      if (!players.some(p => p.id === session.firstDealer)) session.firstDealer = players[0].id;
      commit();
    }
    if (action === 'move') {
      const seat = button.closest('.seat').dataset.seat;
      move(Number(seat), Number(button.dataset.to));
      root.querySelector(`[data-seat="${seat}"] .move-buttons button:not(:disabled)`).focus();
    }
    if (action === 'start') {
      const i = players.findIndex(p => !p.name.trim());
      if (i >= 0) {
        const error = root.querySelector('#setup-error');
        error.textContent = 'Add meg minden játékos nevét.';
        error.hidden = false;
        root.querySelector(`[data-name="${players[i].id}"]`).focus();
        return;
      }
      players.forEach(p => { p.name = p.name.trim(); });
      session.rounds.push(newRound(session.rules));
      commit();
    }
    if (action === 'hand' || action === 'adjust') entryForm(action === 'hand' ? 'hand' : 'adjustment');
    if (action === 'edit') {
      const i = Number(button.dataset.index);
      entryForm(round().entries[i].kind, i);
    }
    if (action === 'finalize') updateRound(candidate => { candidate.finalized = true; });
    if (action === 'next' && session.rounds.every(b => b.finalized)) {
      session.rounds.push(newRound(round().rules));
      session.selected = session.rounds.length - 1;
      commit();
    }
    if (action === 'outstanding') {
      session.selected = session.rounds.findIndex(b => !b.finalized);
      commit();
    }
    if (action === 'transfer') transfer(exportRows());
    if (action === 'reset' && window.confirm('Törlöd az összes bulit, pontot és játékost? Új játék kezdődik.')) {
      session = emptySession();
      reset();
      commit();
    }
  });

  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    try {
      load(localStorage.getItem(key));
      if (dialog.open) dialog.close();
      render();
    } catch { warn('A másik lapon mentett naplót nem sikerült betölteni.'); }
  });
  render();
  return { exportRows };
}
