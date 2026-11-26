import { decimal, format } from './scoring.js';

// Some mobile decimal keyboards omit the minus sign.
export function enhanceNumbers(root) {
  for (const input of root.querySelectorAll('input[inputmode="decimal"]')) {
    const integerOnly = input.id.startsWith('score-') || input.hasAttribute('data-integer');
    input.addEventListener('focus', () => {
      if (decimal(input.value, integerOnly) !== null) {
        input.value = input.value.replace(/[ \u00a0\u202f]/g, '').replace('−', '-');
      }
    });
    input.addEventListener('blur', () => {
      const value = decimal(input.value, integerOnly);
      if (value !== null) input.value = format(value);
    });
    const wrap = document.createElement('div');
    wrap.className = 'number-field';
    input.before(wrap);
    wrap.append(input);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sign';
    toggle.textContent = '±';
    toggle.setAttribute('aria-label', (input.getAttribute('aria-label') || input.labels?.[0]?.textContent || 'Pont') + ' előjelváltás');
    toggle.addEventListener('pointerdown', event => event.preventDefault());
    toggle.addEventListener('click', () => {
      const value = input.value.trim();
      input.value = /^[-−]/.test(value) ? value.slice(1) : '-' + value.replace(/^\+/, '');
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    wrap.append(toggle);
  }
}
