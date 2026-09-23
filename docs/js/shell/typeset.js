// shell/typeset.js — curly quotes and apostrophes in shell-inserted text.
// Walks text nodes only (attributes and markup are untouched) and never enters
// code, readouts or math lines. Double-quote parity runs across the root, so
// a quotation split by <em> still pairs correctly.

const SKIP = 'code, pre, kbd, samp, .readout, .mathline, script, style, textarea';

// state.prev carries the last character of the previous text node, so an
// apostrophe right after inline markup (<em>Euclid</em>'s) still curls as ’.
export function curl(text, state = { inside: false, prev: '' }) {
  const lead = state.prev || ' ';
  if (text) state.prev = text.slice(-1);
  if (!/['"]/.test(text)) return text;
  return (lead + text)
    .replace(/(\w)'(\w)/g, '$1’$2')                   // don't, Euclid's
    .replace(/(^|[\s([{—–-])'/g, '$1‘')               // opening single quote
    .replace(/'/g, '’')                               // every other ' closes
    .replace(/"/g, () => ((state.inside = !state.inside) ? '“' : '”'))
    .slice(lead.length);
}

// A spaced dash never opens a line: the word before it is bound to it with a
// no-break space, so “it — then” can break only after the dash.
export function bindDashes(text) {
  return /\s[—–]\s/.test(text) ? text.replace(/[ \t\r\n]+([—–])(?=[ \t\r\n])/g, '\u00a0$1') : text;
}

export function typeset(root) {
  if (!root || typeof document === 'undefined') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest(SKIP)
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const state = { inside: false, prev: '' };
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const v = n.nodeValue;
    const out = bindDashes(curl(v, state));
    if (out !== v) n.nodeValue = out;
  }
}
