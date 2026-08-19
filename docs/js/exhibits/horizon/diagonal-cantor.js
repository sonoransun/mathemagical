// III.1 — The Diagonal, Again
// Cantor's 1891 diagonal argument, run for real against the visitor's own
// enumeration. Rows are closures over BigInt indices, so the diagonal is
// computable at ANY position; the diagonal is itself just another closure,
// which is why "absorb it as row 0" is one line of code — and why it never
// helps. Plus: the beth tower with the CH gap, and a playable shadow of
// Cohen's forcing (dense requirement cards against a finite condition).
//
// Pure logic (rules, enumeration, diagonalization) is node-testable via _test.

/* ================= pure, node-testable core ================= */

const MAX_IDX = 10n ** 39n;   // jump cap: keeps BigInt primality tests instant
const MR_DETERMINISTIC_BOUND = 3317044064679887385961981n; // first 12 primes as bases

function modPow(base, exp, mod) {
  if (mod === 1n) return 0n;
  let r = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}

// Parity of the binary digit sum (Thue–Morse).
function popParity(n) {
  let c = 0;
  for (const ch of n.toString(2)) if (ch === '1') c ^= 1;
  return c;
}

// Floor square root of a non-negative BigInt (Newton).
function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];

// Miller–Rabin with the first 13 primes as witnesses: deterministic for
// n < 3.3×10^24, astronomically reliable beyond (we cap indices at 10^39).
function isPrime(n) {
  if (n < 2n) return false;
  for (const p of MR_BASES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n, r = 0n;
  while ((d & 1n) === 0n) { d >>= 1n; r++; }
  witness: for (const a of MR_BASES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1n; i < r; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue witness;
    }
    return false;
  }
  return true;
}

// nth digit (0-indexed) of the binary Champernowne word: 1 10 11 100 101 …
// Numbers with k bits contribute k·2^(k−1) digits; C(k) = (k−1)·2^k + 1.
function champBit(n) {
  let k = 1n;
  while (((k - 1n) << k) + 1n <= n) k++;
  const prev = k === 1n ? 0n : ((k - 2n) << (k - 1n)) + 1n;
  const off = n - prev;
  const num = (1n << (k - 1n)) + off / k;
  const bitIdx = off % k;                       // 0 = most significant bit
  return Number((num >> (k - 1n - bitIdx)) & 1n);
}

function mkRule(type, label, fn) {
  return { type, label, eval: (n) => fn(BigInt(n)) };
}

// Rule constructors: every row of the table is one of these — a closure that
// answers 0 or 1 at ANY BigInt index. This is what makes the exhibit honest:
// nothing is precomputed, nothing is finite data pretending to be infinite.
const rules = {
  zeros: () => mkRule('zeros', 'all zeros', () => 0),
  ones: () => mkRule('ones', 'all ones', () => 1),
  periodic: (pat) => {
    const bits = [...String(pat)].map((c) => (c === '1' ? 1 : 0));
    if (!bits.length) bits.push(0);
    const L = BigInt(bits.length);
    return mkRule('periodic', `(${bits.join('')}) repeating`, (n) => bits[Number(n % L)]);
  },
  rational: (p, q) => {
    p = BigInt(p); q = BigInt(q);
    if (q <= 0n) q = 1n;
    const r0 = ((p % q) + q) % q;               // fractional part of p/q
    return mkRule('rational', `${p}/${q} in binary`, (n) => {
      const r = (r0 * modPow(2n, n, q)) % q;
      return 2n * r >= q ? 1 : 0;
    });
  },
  thueMorse: () => mkRule('thueMorse', 'Thue–Morse', (n) => popParity(n)),
  primes: () => mkRule('primes', 'χ(primes)', (n) => (isPrime(n) ? 1 : 0)),
  squares: () => mkRule('squares', 'χ(perfect squares)', (n) => {
    const s = isqrt(n);
    return s * s === n ? 1 : 0;
  }),
  powersOfTwo: () => mkRule('powersOfTwo', 'χ(powers of 2)', (n) =>
    n > 0n && (n & (n - 1n)) === 0n ? 1 : 0),
  champernowne: () => mkRule('champernowne', 'binary Champernowne', (n) => champBit(n)),
  paint: (bits) => {
    const arr = Array.from({ length: 64 }, (_, i) => (bits && bits[i] ? 1 : 0));
    const r = mkRule('paint', 'painted 64, repeated', (n) => arr[Number(n % 64n)]);
    r.bits = arr;                               // mutable — grid clicks toggle
    return r;
  },
};

// The infinite enumeration: row n of the table is rule (n mod k). Every rule
// appears infinitely often, so a sequence that escapes every row escapes the
// visitor's whole repertoire.
function enumAt(list, n) {
  const k = BigInt(list.length);
  const b = BigInt(n);
  return list[Number(((b % k) + k) % k)];
}

// The whole 1891 argument, as executable code. Note it is JUST ANOTHER RULE —
// which is exactly why absorbing it into the list cannot help: the enlarged
// list feeds this same constructor and out steps a new escapee.
function makeDiagonal(list, gen = 1) {
  const snap = list.slice();                    // freeze the enumeration s₀,s₁,…
  const d = mkRule('diagonal',
    gen === 1 ? 'd — the diagonal' : `d${gen} — the new diagonal`,
    (n) => 1 - enumAt(snap, n).eval(n));        // d(n) = 1 − sₙ(n)
  d.gen = gen;
  return d;
}

// Accepts "1000000", "1,000,000", "10^6", "3e12". Null if unparseable.
function parseIndex(raw) {
  const s = String(raw).trim().replace(/[\s,_]/g, '');
  let m = /^(\d+)\^(\d+)$/.exec(s);
  if (m) {
    const b = BigInt(m[1]), e = BigInt(m[2]);
    if (b > 1000000n || e > 512n) return null;
    return b ** e;
  }
  m = /^(\d+)e(\d+)$/i.exec(s);
  if (m) {
    if (m[1].length > 40 || BigInt(m[2]) > 512n) return null;
    return BigInt(m[1]) * 10n ** BigInt(m[2]);
  }
  if (/^\d{1,130}$/.test(s)) return BigInt(s);
  return null;
}

function fmtIdx(n) {
  const s = n.toString();
  if (s.length <= 7) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${s[0]}.${(s.slice(1, 3) + '00').slice(0, 2)}×10^${s.length - 1}`;
}

function starterRows() {
  return [
    rules.zeros(),
    rules.rational(1, 3),
    rules.thueMorse(),
    rules.primes(),
    rules.periodic('0110'),
    rules.champernowne(),
  ];
}

/* ================= the exhibit ================= */

export default {
  id: 'cantor',
  movement: 3,
  title: 'The Diagonal, Again',
  hook: 'Build an infinite list meant to contain every infinite binary sequence. One sequence will step out of it — and will keep stepping out no matter what you do.',
  prose: `
    <p>A diagonal wrecked a worldview once before — the diagonal of the simplest square,
    whose length no ratio of whole numbers could name. In 1891 Georg Cantor drew a second
    diagonal, and this one cut deeper. Suppose someone hands us an infinite list of infinite
    binary sequences — s₀, s₁, s₂, … one per row, forever. (A "list" is the herder's oldest
    trick from this essay's first minutes: a pairing-off, one sequence per counting number,
    nothing left over — and it is exactly that pairing the diagonal is about to break.) Read down the main diagonal and
    flip every bit: define <code>d(n) = 1 − sₙ(n)</code>. This <em>d</em> is a perfectly
    respectable binary sequence, and it cannot be anywhere in the list: it differs from row 0
    at position 0, from row 1 at position 1, from row <em>n</em> at position <em>n</em> —
    one guaranteed typo per row, placed exactly where no rearrangement can patch it. No list
    contains every sequence; the set of infinite binary sequences, and with it the real line,
    is <em>uncountable</em>. (This was Cantor's second proof that the reals outrun the
    integers — the first, in 1874, took a different road.)</p>
    <p>The table below is a real one, and its rows are rules, not ink. Each row is a small
    program that answers, for any index <em>n</em> you name, what its <em>n</em>th digit is:
    all zeros; a pattern of yours, repeated; the binary digits of <code>1/3</code>; the
    Thue–Morse sequence; the characteristic function of the primes. Your finitely many rules
    are listed forever in rotation — row <em>n</em> is rule <em>n</em> mod <em>k</em> — so
    the table honestly owns a row for every natural number. And because rows are rules,
    everything is computable anywhere: jump to position 1,000,000 and the exhibit evaluates
    row 1,000,000 at digit 1,000,000 the moment you ask. The crimson strip is the diagonal
    being computed against your own enumeration — not an animation of the argument; the
    argument.</p>
    <p>Then comes the counterattack everyone invents within a minute: the diagonal looks
    like just another rule — because it <em>is</em> one. "Ask row <em>n</em> for digit
    <em>n</em>; say the opposite" is a one-line program, no grander than "the digits of 1/3."
    So absorb it. Insert <em>d</em> as row 0 and let the list swallow its escapee. The
    insertion costs one array operation, and that cheapness is the whole lesson: the enlarged
    list has its own diagonal — the same line of spite pointed at the new indexing — and it
    differs from your captured <em>d</em> at position 0 before you have finished feeling
    clever. The counter will keep score. The score is always theorem 1, you 0. The escape
    never depended on which list you wrote; it is a property of <em>listing</em>.</p>
    <p>Zoom out and the trick detonates at every scale. Cantor's theorem in full: for
    <em>every</em> set X there is no surjection from X onto its power set P(X) — the diagonal
    argument again, word for word, with "position <em>n</em>" replaced by "element
    <em>x</em>." So the infinities climb an endless ladder, ℵ₀ &lt; 2<sup>ℵ₀</sup> &lt;
    2<sup>2<sup>ℵ₀</sup></sup> &lt; …, the beth numbers ℶ₀, ℶ₁, ℶ₂, …, with no top rung. And
    between the first two rungs sits the oldest open wound in set theory. The <em>continuum
    hypothesis</em> — Cantor's conjecture of 1878, first on Hilbert's famous list of 1900 —
    says there is no cardinality strictly between ℵ₀ and 2<sup>ℵ₀</sup>. Gödel showed in 1940 — working in ZFC, the standard axioms of set theory —
    that ZFC cannot disprove it: inside his constructible universe L, CH holds. Cohen showed
    in 1963 that ZFC cannot prove it: forcing builds worlds where it fails. Each result holds
    relative to the consistency of ZFC itself. The axioms we actually use cannot see whether
    the gap is empty.</p>
    <p>The third panel lets you play a finger-shadow of Cohen's method. Grow a finite string
    of bits — a <em>condition</em>, which only ever gets longer. The machine deals demands,
    each one <em>dense</em>: a requirement that no finite condition can be blocked from
    meeting. Meet them all and you will have forced into existence a real that escapes your
    entire ground list, using nothing but patience. What forcing means for the <em>truth</em>
    of CH — whether that question even has a truth to find — is a live dispute among working
    set theorists, and it waits below, behind the label that marks where theorem ends and
    conviction begins.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;

    /* ---------- state ---------- */
    let rows = starterRows();
    let diag = null;              // current diagonal rule (null until revealed)
    let revealed = false;
    let attempts = 0;             // absorptions performed
    let mode = 'list';            // 'list' | 'tower' | 'forcing'
    let focusN = null;            // BigInt index under inspection, or null
    const view = { col: 0n, row: 0n, fx: 0, fy: 0 };
    let dirty = true;
    let pulse = 0;                // strip glow after reveal/absorb
    let anim = null;              // absorb animation { t, dur }
    const cache = new Map();      // "m:n" -> 0|1  (cleared on any list change)

    // audio
    const bus = audio.createBus('cantor');
    let player = null;            // scheduler for "sound the diagonal"
    let edgeQueue = [];           // { n: BigInt, at: audioTime }
    let playN = null;             // column currently sounding

    // forcing game
    let fGround = null;           // snapshot of rows at game start
    let fCond = [];               // the condition: finite 0/1 string
    let fCards = [];              // dealt requirement cards
    let fWaves = [];              // undealt waves
    let fWon = false;

    /* ---------- scoped style ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-cantor input.dg-in { background:${P.bg}; border:1px solid ${P.line}; color:${P.ink};
        font:13px ui-monospace, Menlo, monospace; padding:6px 9px; border-radius:6px; width:130px; }
      #ex-cantor input.dg-in:focus { outline:none; border-color:${P.gold}; }
      #ex-cantor .dg-cards { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 4px; }
      #ex-cantor .dg-card { border:1px solid ${P.line}; background:${P.panel}; border-radius:8px;
        padding:8px 10px; font-size:12.5px; line-height:1.45; color:${P.inkDim}; max-width:250px;
        display:flex; flex-direction:column; gap:6px; align-items:flex-start; }
      #ex-cantor .dg-card.met { border-color:${P.verdant}66; color:${P.ink}; }
      #ex-cantor .dg-card .tick { color:${P.verdant}; }
      #ex-cantor .dg-cond { font:13px ui-monospace, Menlo, monospace; letter-spacing:0.08em;
        word-break:break-all; background:${P.bg}; border:1px solid ${P.line}; border-radius:6px;
        padding:8px 10px; margin-top:8px; color:${P.azure}; min-height:1.3em; }
      #ex-cantor .dg-fnote { font-size:12.5px; color:${P.inkDim}; font-style:italic;
        margin:10px 0 0; line-height:1.5; }
      #ex-cantor .dg-victory { border-left:2px solid ${P.verdant}; padding:8px 12px;
        margin-top:10px; color:${P.ink}; font-size:13.5px; line-height:1.55; display:none; }`;
    stage.appendChild(style);

    /* ---------- layout ---------- */
    const quest = ui.questBanner(stage, '');
    const handle = cv.setupCanvas(stage, { height: 480 });
    handle.onResize(() => { dirty = true; });

    const modeRow = ui.controlRow(stage);
    const modeBtns = {};
    modeBtns.list = ui.button(modeRow, 'the list', () => setMode('list'), { small: true });
    modeBtns.tower = ui.button(modeRow, 'the tower', () => setMode('tower'), { small: true });
    modeBtns.forcing = ui.button(modeRow, 'the forcing game', () => setMode('forcing'), { small: true });

    const rowA = ui.controlRow(stage);
    const revealBtn = ui.button(rowA, 'reveal the diagonal', reveal, { primary: true });
    const absorbBtn = ui.button(rowA, 'fine — insert the diagonal as row 0', absorb, { primary: true });
    const soundBtn = ui.button(rowA, '▶ sound the diagonal', playDiagonal);
    const homeBtn = ui.button(rowA, '⌂ home', goHome, { small: true });
    absorbBtn.style.display = 'none';
    soundBtn.style.display = 'none';

    const rowB = ui.controlRow(stage);
    let pendingType = 'zeros';
    const typeSel = ui.select(rowB, {
      label: 'new row (a rule, not data)',
      options: [
        { value: 'zeros', label: 'all zeros' },
        { value: 'ones', label: 'all ones' },
        { value: 'periodic', label: 'periodic pattern…' },
        { value: 'rational', label: 'a rational p/q in binary…' },
        { value: 'thueMorse', label: 'Thue–Morse' },
        { value: 'primes', label: 'χ(primes)' },
        { value: 'squares', label: 'χ(perfect squares)' },
        { value: 'powersOfTwo', label: 'χ(powers of 2)' },
        { value: 'champernowne', label: 'binary Champernowne' },
        { value: 'paint', label: 'paint 64 digits, repeat' },
      ],
      value: 'zeros',
      onChange: (v) => { pendingType = v; refreshParam(); },
    });
    const paramWrap = document.createElement('div');
    paramWrap.className = 'ctl';
    const paramLab = document.createElement('div');
    paramLab.className = 'ctl-label';
    paramLab.textContent = 'parameter';
    const paramIn = document.createElement('input');
    paramIn.className = 'dg-in';
    paramWrap.appendChild(paramLab);
    paramWrap.appendChild(paramIn);
    rowB.appendChild(paramWrap);
    const addBtn = ui.button(rowB, '+ add row', addRow);
    const resetBtn = ui.button(rowB, 'reset the list', resetList, { small: true });

    function refreshParam() {
      const need = pendingType === 'periodic' || pendingType === 'rational';
      paramWrap.style.display = need ? '' : 'none';
      paramIn.placeholder = pendingType === 'periodic' ? 'e.g. 0110' : 'e.g. 3/7';
    }
    refreshParam();

    const rowC = ui.controlRow(stage);
    const jumpWrap = document.createElement('div');
    jumpWrap.className = 'ctl';
    const jumpLab = document.createElement('div');
    jumpLab.className = 'ctl-label';
    jumpLab.textContent = 'jump to index n (try 10^6)';
    const jumpIn = document.createElement('input');
    jumpIn.className = 'dg-in';
    jumpIn.placeholder = '1000000 · 10^6 · 3e12';
    jumpWrap.appendChild(jumpLab);
    jumpWrap.appendChild(jumpIn);
    rowC.appendChild(jumpWrap);
    const jumpBtn = ui.button(rowC, 'go — check the mismatch', doJump);
    jumpIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJump(); });

    // forcing panel (DOM); hidden until that mode
    const fPanel = document.createElement('div');
    stage.appendChild(fPanel);
    fPanel.style.display = 'none';
    const fIntro = document.createElement('p');
    fIntro.className = 'dg-fnote';
    fIntro.innerHTML =
      'A <em>condition</em> is a finite binary string — yours, below. It only ever grows: ' +
      'that is the partial order. Each card names a <em>dense set</em>: a demand no finite ' +
      'condition can be blocked from meeting. There is no undo, and you will not need one.';
    fPanel.appendChild(fIntro);
    const cardsDiv = document.createElement('div');
    cardsDiv.className = 'dg-cards';
    fPanel.appendChild(cardsDiv);
    const fRow = ui.controlRow(fPanel);
    ui.button(fRow, 'append 0', () => appendBits([0]));
    ui.button(fRow, 'append 1', () => appendBits([1]));
    ui.button(fRow, 'restart the game', startForcing, { small: true });
    const condDiv = document.createElement('div');
    condDiv.className = 'dg-cond';
    fPanel.appendChild(condDiv);
    const victoryDiv = document.createElement('div');
    victoryDiv.className = 'dg-victory';
    victoryDiv.innerHTML =
      'Every card met. Any infinite extension of your string now differs from every row of ' +
      'your ground list — the mismatches are locked into the finite part forever. You met ' +
      'countably many dense sets; Cohen’s forcing plays this exact game but meets ' +
      '<em>every</em> dense set living in the model of set theory being extended — and adds ' +
      'ℵ₂ such reals at once, making CH false in the extension. The bookkeeping that keeps ' +
      'the cardinals intact while it happens is where the real work lives.';
    fPanel.appendChild(victoryDiv);

    const readout = ui.readout(stage, '');
    const capEl = ui.caption(stage, '');

    ui.legendPanel(stage, `
      <p>Cantor paid for the diagonal. The story, told and retold, has Leopold Kronecker —
      the reigning power of Berlin mathematics — calling him a <em>corrupter of youth</em>
      and working to keep his papers out of print; the famous aphorism <em>"God made the
      integers; all the rest is the work of man"</em> also reaches us secondhand, through an
      1893 memorial lecture, not Kronecker's own pen. The hostility, at any rate, was real,
      and Cantor spent his later years in and out of the Halle nerve clinic. The fullest
      reply is fully documented: <em>"No one shall expel us from the paradise that Cantor
      has created."</em> — David Hilbert, 1926.</p>`);

    const specPanel = ui.speculationPanel(stage, `
      <p>Independence closed the ZFC case but not the conversation: is CH nonetheless
      <em>true</em>? Here working set theorists genuinely part ways. Joel David Hamkins's
      <em>multiverse</em> view holds that the many worlds forcing builds are all equally
      real, and CH simply holds in some and fails in others — there is no further fact.
      <em>Universe</em> views, like W. Hugh Woodin's Ultimate-L program, hold that one
      canonical universe of sets is the real one, and that stronger axioms will someday
      decide CH inside it. Two hard theorems are often read as leaning against CH: Foreman,
      Magidor, and Shelah proved in 1988 that Martin's Maximum — a maximal forcing axiom —
      implies 2<sup>ℵ₀</sup> = ℵ₂; and Asperó and Schindler proved in the <em>Annals of
      Mathematics</em> (2021) that MM<sup>++</sup> implies Woodin's (∗) axiom, uniting two
      programs that had seemed to compete — and (∗) too forces the continuum to ℵ₂. The
      theorems are theorems. Whether they are <em>evidence</em> — whether CH has a
      determinate truth value at all — is philosophy, and this panel is the label saying
      so.</p>`);
    specPanel.style.display = 'none';

    /* ---------- caches & helpers ---------- */

    function rowsCount() { return rows.length; }

    function cellVal(m, n) {
      const key = m.toString() + ':' + n.toString();
      let v = cache.get(key);
      if (v === undefined) {
        v = enumAt(rows, m).eval(n);
        if (cache.size > 24000) cache.clear();
        cache.set(key, v);
      }
      return v;
    }

    function listChanged() { cache.clear(); dirty = true; }

    /* ---------- text management ---------- */

    const ESCALATE = [
      `The diagonal <em>d</em> is one act of spite repeated forever: whatever row <em>n</em>
       says at position <em>n</em>, say the opposite. Check it anywhere — the mismatch is
       computed the moment you look, not staged in advance.`,
      `Reindexed in an instant. Your old diagonal sits obediently at row 0 — and the new
       diagonal already differs from it at position 0. One array insert bought you nothing.`,
      `Again. Notice the economics: absorbing the escapee costs one line of code, and
       escaping costs one line of code. That exchange rate will never change.`,
      `You could do this a thousand times; you could do it forever, and the tower of absorbed
       diagonals would itself be a list — with its own diagonal. The escape is not a race.
       It is a theorem.`,
      `Every list you will ever write was lost before you wrote it. The diagonal is not
       clever; it is the shape of the gap between a set and its power set.`,
    ];

    function updateTexts() {
      const k = rowsCount();
      if (mode === 'list') {
        if (!revealed) {
          quest.set(`Build a list meant to contain <em>every</em> infinite binary sequence — ` +
            `row <em>n</em> is your rule <em>n</em> mod ${k}, so there is a row for every ` +
            `index. When you believe in it, reveal the diagonal.`);
          capEl.innerHTML = `Rows are rules: each answers at any index, so the table is a ` +
            `genuine infinite object, interrogated live. Add rules, paint one, drag to pan — ` +
            `then reveal what waits below.`;
        } else {
          quest.set(attempts === 0
            ? `The diagonal differs from row <em>n</em> at position <em>n</em> — every ` +
              `<em>n</em>, forever. Jump anywhere and check. Then try the obvious counterattack.`
            : `Attempt ${attempts}: ${attempts} diagonal${attempts > 1 ? 's' : ''} absorbed — ` +
              `and the newest one has already escaped. This will not end.`);
          capEl.innerHTML = attempts < ESCALATE.length
            ? ESCALATE[attempts]
            : `Attempt ${attempts}. The reals are not merely many — they outrun listing
               itself. That is what <em>uncountable</em> means.`;
        }
        absorbBtn.textContent = attempts === 0
          ? 'fine — insert the diagonal as row 0' : 'absorb it again';
        defaultReadout();
      } else if (mode === 'tower') {
        quest.set(`One rung per power set. The ladder has no top; the first gap has no answer in ZFC.`);
        capEl.innerHTML = `Cantor's theorem: for <em>every</em> set X there is no surjection ` +
          `X → P(X) — so each rung is strictly outgrown by the next, through the beth numbers ` +
          `ℶ₀ = ℵ₀, ℶ₁ = 2<sup>ℵ₀</sup>, ℶ₂, … The crimson gap is the continuum hypothesis: ` +
          `no cardinality strictly between ℵ₀ and 2<sup>ℵ₀</sup>. Gödel 1940: ZFC cannot ` +
          `disprove it (constructible universe L). Cohen 1963: ZFC cannot prove it (forcing). ` +
          `Both relative to Con(ZFC).`;
        readout.set(`your table — every row, every absorbed diagonal — lives on the bottom rung`);
      } else {
        if (fWon) {
          quest.done(`Every card met — the real you are forcing escapes your entire ground list.`);
        } else {
          quest.set(`Meet every card. Each is dense: no finite condition is ever stuck.`);
        }
        capEl.innerHTML = `Each card is a <em>dense set</em>: whatever finite condition you ` +
          `hold, some extension meets the card — density is why you cannot be cornered, and ` +
          `density is what Cohen's method industrializes. The canvas shows your ground list ` +
          `(from part one) with mismatches marked as they lock in.`;
      }
    }

    function defaultReadout() {
      const k = rowsCount();
      readout.set(`${k} rules · row n = rule (n mod ${k}) · ` +
        (revealed ? `d(n) = 1 − s_n(n), pinned in crimson below` : `diagonal not yet revealed`) +
        ` · drag the table, click any cell`);
    }

    function explainDiag(n, sound) {
      const k = BigInt(rowsCount());
      const j = Number(((n % k) + k) % k);
      const rule = rows[j];
      const s = cellVal(n, n);
      let txt = `row ${fmtIdx(n)} is rule #${j} (${rule.label}) · s_n(n) = ${s}`;
      if (revealed) txt += ` · d(n) = ${1 - s} — differs at position ${fmtIdx(n)}, as promised`;
      if (rule.type === 'primes' && n > MR_DETERMINISTIC_BOUND) {
        txt += ` · (Miller–Rabin, 13 bases: deterministic below 3.3×10²⁴, astronomically reliable beyond)`;
      }
      readout.set(txt);
      if (sound && revealed) pingFlip(s);
    }

    function explainCell(m, n) {
      const rule = enumAt(rows, m);
      const v = cellVal(m, n);
      audio.ensureAudio();
      audio.playTone(bus, { freq: v ? 660 : 330, dur: 0.07, level: 0.15 });
      readout.set(`row ${fmtIdx(m)}, position ${fmtIdx(n)} — rule "${rule.label}" answers ${v}` +
        (m === n && !revealed ? ' · a diagonal cell: reveal d to see it flipped' : ''));
    }

    /* ---------- audio ---------- */

    function pingFlip(s) {
      audio.ensureAudio();
      const t = bus.context.currentTime + 0.02;
      audio.playTone(bus, { freq: s ? 392 : 196, dur: 0.12, level: 0.25, when: t });
      audio.playTone(bus, { freq: s ? 233.1 : 466.2, dur: 0.2, level: 0.5, type: 'triangle', when: t + 0.11 });
    }

    function stopPlay() {
      if (player) { player.stop(); player = null; }
      edgeQueue = [];
      playN = null;
      soundBtn.textContent = '▶ sound the diagonal';
      dirty = true;
    }

    function playDiagonal() {
      if (!revealed) return;
      if (player) { stopPlay(); return; }
      audio.ensureAudio();
      const { visCols } = gridMetrics();
      const cols = Array.from({ length: visCols }, (_, i) => view.col + BigInt(i));
      let i = 0;
      player = audio.createScheduler((t) => {
        if (i >= cols.length) return null;
        const n = cols[i];
        const s = cellVal(n, n);
        // first the row's own bit, softly; then the flipped diagonal bit, accented
        audio.playTone(bus, { freq: s ? 392 : 196, dur: 0.1, level: 0.18, when: t });
        audio.playTone(bus, { freq: s ? 233.1 : 466.2, dur: 0.15, level: 0.45, type: 'triangle', when: t + 0.085 });
        edgeQueue.push({ n, at: t });
        i++;
        return t + 0.19;
      });
      player.start();
      soundBtn.textContent = '■ stop';
    }

    function chime() {
      audio.ensureAudio();
      const t = bus.context.currentTime + 0.02;
      audio.playTone(bus, { freq: 523.25, dur: 0.12, level: 0.3, when: t });
      audio.playTone(bus, { freq: 659.25, dur: 0.2, level: 0.3, when: t + 0.1 });
    }

    /* ---------- actions ---------- */

    function reveal() {
      if (revealed) return;
      revealed = true;
      audio.ensureAudio();
      diag = makeDiagonal(rows, 1);
      revealBtn.style.display = 'none';
      absorbBtn.style.display = '';
      soundBtn.style.display = '';
      pulse = 1;
      pingFlip(cellVal(0n, 0n));
      updateTexts();
      dirty = true;
    }

    function absorb() {
      if (!revealed || anim) return;
      audio.ensureAudio();
      stopPlay();
      focusN = null;
      view.col = 0n; view.row = 0n; view.fx = 0; view.fy = 0;
      anim = { t: 0, dur: 0.55 };
      const t0 = bus.context.currentTime + 0.02;
      audio.playTone(bus, { freq: 494, dur: 0.16, level: 0.28, when: t0 });
      audio.playTone(bus, { freq: 330, dur: 0.16, level: 0.28, when: t0 + 0.13 });
      audio.playTone(bus, { freq: 220, dur: 0.22, level: 0.28, when: t0 + 0.26 });
      dirty = true;
    }

    function finishAbsorb() {
      // The exhibit's central line of code: the escapee becomes row 0 …
      diag.label = diag.gen === 1 ? 'd (absorbed)' : `d${diag.gen} (absorbed)`;
      rows = [diag, ...rows];
      // … and the same constructor immediately mints a new escapee.
      diag = makeDiagonal(rows, attempts + 2);
      attempts++;
      anim = null;
      pulse = 1;
      listChanged();
      updateTexts();
      const t0 = bus.context.currentTime + 0.05;
      audio.playTone(bus, { freq: 466.2, dur: 0.25, level: 0.45, type: 'triangle', when: t0 });
    }

    function addRow() {
      if (rowsCount() >= 24) { readout.set('24 rows is enough to lose with.'); return; }
      let r = null;
      if (pendingType === 'periodic') {
        const pat = paramIn.value.trim();
        if (!/^[01]{1,32}$/.test(pat)) { readout.set('pattern must be 1–32 characters of 0s and 1s'); return; }
        r = rules.periodic(pat);
      } else if (pendingType === 'rational') {
        const m = /^(\d{1,12})\s*\/\s*(\d{1,12})$/.exec(paramIn.value.trim());
        if (!m || BigInt(m[2]) === 0n) { readout.set('give a fraction like 3/7'); return; }
        r = rules.rational(BigInt(m[1]), BigInt(m[2]));
      } else {
        r = rules[pendingType]();
      }
      rows.push(r);
      if (revealed) diag = makeDiagonal(rows, diag.gen);  // d always flips the CURRENT list
      listChanged();
      updateTexts();
      readout.set(`added "${r.label}" as a rule — the enumeration now cycles ${rowsCount()} rules` +
        (r.type === 'paint' ? ' · click its cells in the table to paint (position mod 64)' : '') +
        (revealed ? ' · the diagonal has already adjusted' : ''));
    }

    function resetList() {
      stopPlay();
      rows = starterRows();
      diag = null;
      revealed = false;
      attempts = 0;
      focusN = null;
      anim = null;
      view.col = 0n; view.row = 0n; view.fx = 0; view.fy = 0;
      revealBtn.style.display = '';
      absorbBtn.style.display = 'none';
      soundBtn.style.display = 'none';
      listChanged();
      updateTexts();
    }

    function goHome() {
      view.col = 0n; view.row = 0n; view.fx = 0; view.fy = 0;
      focusN = null;
      dirty = true;
      if (mode === 'list') defaultReadout();
    }

    function doJump() {
      if (mode !== 'list') setMode('list');
      const n = parseIndex(jumpIn.value);
      if (n === null) {
        readout.set('give an index like 1000000, 10^6, or 3e12 (up to 10^39)');
        return;
      }
      if (n > MAX_IDX) {
        readout.set('capped at 10^39 — beyond that, the primality tests start charging real time');
        return;
      }
      focusN = n;
      const back = n > 2n ? n - 2n : 0n;
      view.col = back; view.row = back; view.fx = 0; view.fy = 0;
      explainDiag(n, true);
      dirty = true;
    }

    function setMode(m) {
      if (mode === m) return;
      mode = m;
      stopPlay();
      for (const [name, btn] of Object.entries(modeBtns)) btn.classList.toggle('active', name === m);
      const listUI = m === 'list' ? '' : 'none';
      rowA.style.display = listUI;
      rowB.style.display = listUI;
      rowC.style.display = listUI;
      fPanel.style.display = m === 'forcing' ? '' : 'none';
      specPanel.style.display = m === 'list' ? 'none' : '';
      cvEl.style.cursor = m === 'list' ? 'grab' : 'default';
      if (m === 'forcing' && !fGround) startForcing();
      if (m === 'forcing') renderForcing();
      updateTexts();
      dirty = true;
    }

    /* ---------- forcing game ---------- */

    function cardLength(L) {
      return {
        desc: `grow your condition to length ≥ ${L}`,
        test: () => fCond.length >= L,
        meet: () => Array(Math.max(0, L - fCond.length)).fill(0),
      };
    }
    function cardBlock(b) {
      return {
        desc: `make the block ⟨${b}⟩ appear somewhere`,
        test: () => fCond.join('').includes(b),
        meet: () => [...b].map(Number),
      };
    }
    function cardOnes(c) {
      return {
        desc: `place at least ${c} ones`,
        test: () => fCond.reduce((a, b) => a + b, 0) >= c,
        meet: () => Array(Math.max(0, c - fCond.reduce((a, b) => a + b, 0))).fill(1),
      };
    }
    function cardDiffer(j) {
      const rule = fGround[j];
      return {
        desc: `differ somewhere from row ${j} of your list (${rule.label})`,
        test: () => fCond.some((b, i) => b !== rule.eval(BigInt(i))),
        meet: () => [1 - rule.eval(BigInt(fCond.length))],
      };
    }

    function startForcing() {
      fGround = rows.slice();
      fCond = [];
      fWon = false;
      victoryDiv.style.display = 'none';
      const w1 = [cardLength(12), cardBlock('101'), cardDiffer(0)];
      const w2 = [];
      for (let j = 1; j < Math.min(3, fGround.length); j++) w2.push(cardDiffer(j));
      w2.push(cardOnes(8));
      const w3 = [];
      for (let j = 3; j < fGround.length; j++) w3.push(cardDiffer(j));
      w3.push(cardLength(40));
      fWaves = [w2, w3];
      fCards = w1;
      for (const c of fCards) c.met = c.test();
      updateTexts();
      renderForcing();
      dirty = true;
    }

    function meetCard(card) {
      appendBits(card.meet());
    }

    function appendBits(bits) {
      if (fWon || !bits.length) return;
      audio.ensureAudio();
      const t0 = bus.context.currentTime + 0.02;
      bits.forEach((b, i) => {
        fCond.push(b ? 1 : 0);
        if (i < 12) audio.playTone(bus, { freq: b ? 587 : 294, dur: 0.05, level: 0.16, when: t0 + i * 0.035 });
      });
      let newly = 0;
      for (const c of fCards) { const was = c.met; c.met = c.test(); if (!was && c.met) newly++; }
      if (newly) chime();
      while (fCards.every((c) => c.met) && fWaves.length) {
        const wave = fWaves.shift();
        for (const c of wave) c.met = c.test();
        fCards.push(...wave);
      }
      if (fCards.every((c) => c.met) && !fWaves.length && !fWon) {
        fWon = true;
        victoryDiv.style.display = 'block';
        chime();
        updateTexts();
      }
      renderForcing();
      dirty = true;
    }

    function renderForcing() {
      cardsDiv.innerHTML = '';
      for (const card of fCards) {
        const chip = document.createElement('div');
        chip.className = 'dg-card' + (card.met ? ' met' : '');
        const t = document.createElement('div');
        t.innerHTML = (card.met ? '<span class="tick">✓</span> ' : '✦ ') + card.desc;
        chip.appendChild(t);
        if (!card.met) ui.button(chip, 'meet it — density in action', () => meetCard(card), { small: true });
        cardsDiv.appendChild(chip);
      }
      if (fCond.length === 0) {
        condDiv.textContent = '⟨empty condition⟩ — every escape from every list starts at zero bits';
      } else {
        const grouped = fCond.join('').replace(/(.{8})/g, '$1 ').trim();
        condDiv.textContent = grouped + `   (length ${fCond.length})`;
      }
      readout.set(`condition length ${fCond.length} · cards met ${fCards.filter((c) => c.met).length}/${fCards.length}` +
        (fWaves.length ? ` · more cards wait` : fWon ? ` · game over: you won — so does Cohen` : ` · last wave`));
    }

    /* ---------- drawing: the list ---------- */

    const CELL = 30, GUT = 170, HEAD = 30;
    const FONT = '12px ui-monospace, Menlo, monospace';
    const FONT_S = '10px ui-monospace, Menlo, monospace';
    const FONT_L = '11px ui-monospace, Menlo, monospace';

    function gridMetrics() {
      const W = handle.width, H = handle.height;
      const stripY = H - CELL - 10;
      const visRows = Math.max(1, Math.floor((stripY - 14 - HEAD) / CELL));
      const visCols = Math.max(1, Math.floor((W - GUT) / CELL));
      return { W, H, stripY, visRows, visCols };
    }

    function fit(ctx, text, maxW) {
      if (ctx.measureText(text).width <= maxW) return text;
      while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
      return text + '…';
    }

    function alphaHex(a) {
      return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
    }

    function screenRow(m) {
      const d = m - view.row;
      if (d < 0n || d > 64n) return null;
      return Number(d);
    }

    function drawCell(ctx, x, y, m, n, rule) {
      const v = cellVal(m, n);
      if (v) { ctx.fillStyle = P.goldDim + '30'; ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); }
      if (focusN !== null && (m === focusN || n === focusN)) {
        ctx.fillStyle = P.azure + '16';
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      }
      ctx.fillStyle = v ? P.ink : P.inkFaint;
      ctx.fillText(String(v), x + CELL / 2, y + CELL / 2 + 0.5);
      if (rule.type === 'paint') {
        ctx.fillStyle = P.azureDim + '77';
        ctx.fillRect(x + 5, y + CELL - 4.5, CELL - 10, 2);
      }
      if (m === n) {
        ctx.strokeStyle = revealed ? P.crimson : P.line;
        ctx.lineWidth = revealed ? 1.6 : 1;
        ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      }
    }

    function drawList() {
      const { W, stripY, visRows, visCols } = gridMetrics();
      const ctx = handle.ctx;
      ctx.clearRect(0, 0, W, handle.height);
      const gridBottom = stripY - 10;
      const p = anim ? Math.min(1, anim.t / anim.dur) : 0;
      const ease = p * p * (3 - 2 * p);
      const slide = anim ? ease * CELL : 0;

      // column headers (label every few columns, anchored to absolute index)
      ctx.font = FONT_S;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labEvery = BigInt(Math.max(1, Math.ceil(78 / CELL)));
      for (let c = 0; c <= visCols; c++) {
        const n = view.col + BigInt(c);
        const x = GUT + (c - view.fx) * CELL + CELL / 2;
        if (x < GUT || x > W) continue;
        if (n % labEvery === 0n || (focusN !== null && n === focusN)) {
          ctx.fillStyle = focusN !== null && n === focusN ? P.goldBright : P.inkFaint;
          ctx.fillText(fmtIdx(n), x, HEAD - 15);
        }
      }

      // gutter labels (clip vertically to the grid band)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, HEAD, W, gridBottom - HEAD);
      ctx.clip();
      ctx.font = FONT_L;
      ctx.textAlign = 'left';
      for (let r = 0; r <= visRows; r++) {
        const m = view.row + BigInt(r);
        const y = HEAD + (r - view.fy) * CELL + slide;
        if (y + CELL < HEAD || y > gridBottom) continue;
        const rule = enumAt(rows, m);
        ctx.fillStyle = rule.type === 'diagonal' ? P.crimson :
          (focusN !== null && m === focusN) ? P.goldBright : P.inkDim;
        ctx.fillText(fit(ctx, `${fmtIdx(m)} · ${rule.label}`, GUT - 18), 10, y + CELL / 2);
      }
      ctx.restore();

      // cells (clip to grid rect)
      ctx.save();
      ctx.beginPath();
      ctx.rect(GUT, HEAD, W - GUT, gridBottom - HEAD);
      ctx.clip();
      ctx.font = FONT;
      ctx.textAlign = 'center';
      for (let r = 0; r <= visRows; r++) {
        const m = view.row + BigInt(r);
        const y = HEAD + (r - view.fy) * CELL + slide;
        if (y + CELL < HEAD || y > gridBottom) continue;
        const rule = enumAt(rows, m);
        for (let c = 0; c <= visCols; c++) {
          const n = view.col + BigInt(c);
          const x = GUT + (c - view.fx) * CELL;
          if (x + CELL < GUT || x > W) continue;
          drawCell(ctx, x, y, m, n, rule);
        }
      }
      ctx.restore();

      // separator
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, stripY - 5.5);
      ctx.lineTo(W, stripY - 5.5);
      ctx.stroke();

      // the diagonal strip
      const yS = stripY - (stripY - HEAD) * ease;
      ctx.font = FONT_L;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      if (!revealed) {
        ctx.fillStyle = P.inkFaint;
        ctx.fillText('d(n) = 1 − s_n(n) — not yet revealed', 10, stripY + CELL / 2);
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = P.line;
        ctx.strokeRect(GUT + 0.5, stripY + 0.5, W - GUT - 6, CELL - 1);
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = P.crimson;
        ctx.fillText(fit(ctx, 'd(n) = 1 − s_n(n)', GUT - 18), 10, yS + CELL / 2);
        ctx.save();
        ctx.beginPath();
        ctx.rect(GUT, 0, W - GUT, handle.height);
        ctx.clip();
        if (pulse > 0) {
          ctx.fillStyle = P.crimson + alphaHex(pulse * 0.28);
          ctx.fillRect(GUT, yS, W - GUT, CELL);
        }
        ctx.font = FONT;
        ctx.textAlign = 'center';
        for (let c = 0; c <= visCols; c++) {
          const n = view.col + BigInt(c);
          const x = GUT + (c - view.fx) * CELL;
          if (x + CELL < GUT || x > W) continue;
          const s = cellVal(n, n);
          const v = 1 - s;
          ctx.fillStyle = P.crimson + (v ? '3a' : '1c');
          ctx.fillRect(x + 1, yS + 1, CELL - 2, CELL - 2);
          ctx.fillStyle = v ? P.goldBright : P.inkDim;
          ctx.fillText(String(v), x + CELL / 2, yS + CELL / 2 + 0.5);
          if (playN !== null && n === playN) {
            ctx.strokeStyle = P.goldBright;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, yS + 1, CELL - 2, CELL - 2);
          }
          // connector from the diagonal cell (n,n) down to the strip
          if (focusN !== null && n === focusN && !anim) {
            const r = screenRow(n);
            if (r !== null && r <= visRows) {
              const yCell = HEAD + (r - view.fy) * CELL;
              if (yCell >= HEAD && yCell + CELL <= gridBottom + CELL) {
                ctx.setLineDash([3, 4]);
                ctx.strokeStyle = P.crimson;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + CELL / 2, yCell + CELL);
                ctx.lineTo(x + CELL / 2, yS - 12);
                ctx.stroke();
                ctx.setLineDash([]);
              }
              ctx.fillStyle = P.crimson;
              ctx.font = FONT_L;
              ctx.fillText('≠', x + CELL / 2, yS - 7);
              ctx.font = FONT;
            }
          }
        }
        ctx.restore();
      }
    }

    /* ---------- drawing: the tower ---------- */

    function drawTower() {
      const { W, H } = handle;
      const ctx = handle.ctx;
      ctx.clearRect(0, 0, W, H);
      const cx = W * 0.38;
      const yb = H - 66;
      const ys = [yb, yb - 124, yb - 224, yb - 304];
      const widths = [0.62, 0.5, 0.4, 0.32].map((f) => f * (W - 40));
      const RUNGS = [
        { lab: 'ℵ₀', sub: 'the countable — every infinite list anyone can write. Your table lives here, absorb attempts and all.' },
        { lab: '2^ℵ₀', sub: 'the continuum — where every diagonal escapes to.' },
        { lab: '2^(2^ℵ₀)', sub: 'all sets of reals — the trick strikes again.' },
        { lab: '2^(2^(2^ℵ₀)), …', sub: 'no top rung, ever.' },
      ];
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 4; i++) {
        const y = ys[i], w = widths[i];
        ctx.strokeStyle = P.gold + (i === 0 ? '' : ['', 'cc', '99', '66'][i]);
        ctx.lineWidth = 2.5 - i * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx - w / 2, y);
        ctx.lineTo(cx + w / 2, y);
        ctx.stroke();
        ctx.font = '13px ui-monospace, Menlo, monospace';
        ctx.fillStyle = P.ink;
        ctx.textAlign = 'center';
        ctx.fillText(RUNGS[i].lab, cx, y - 13);
        ctx.font = FONT_L;
        ctx.fillStyle = P.inkDim;
        ctx.fillText(fit(ctx, RUNGS[i].sub, W - 30), cx, y + 14);
        if (i < 3) {
          const ym = (y + ys[i + 1]) / 2;
          ctx.strokeStyle = P.azureDim;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx - w / 2 - 16, y - 8);
          ctx.lineTo(cx - w / 2 - 16, ys[i + 1] + 8);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - w / 2 - 20, ys[i + 1] + 14);
          ctx.lineTo(cx - w / 2 - 16, ys[i + 1] + 8);
          ctx.lineTo(cx - w / 2 - 12, ys[i + 1] + 14);
          ctx.stroke();
          ctx.fillStyle = P.azureDim;
          ctx.textAlign = 'right';
          ctx.font = FONT_S;
          ctx.fillText('P( · )', cx - w / 2 - 24, ym);
        }
      }
      // Cantor's theorem note, left
      ctx.textAlign = 'left';
      ctx.font = FONT_S;
      ctx.fillStyle = P.azureDim;
      ctx.fillText('no surjection X → P(X)', 12, ys[1] - 40);
      ctx.fillText('— for every set X', 12, ys[1] - 28);
      // dots above
      ctx.textAlign = 'center';
      ctx.fillStyle = P.inkFaint;
      ctx.font = '15px ui-monospace, Menlo, monospace';
      ctx.fillText('⋮', cx, ys[3] - 34);
      // the CH gap, right of rung 0→1
      const gx = Math.min(cx + widths[0] / 2 + 22, W - 240);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = P.crimson;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(gx, ys[1] + 10);
      ctx.lineTo(gx, ys[0] - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.crimson;
      ctx.font = '17px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', gx, (ys[0] + ys[1]) / 2 - 36);
      ctx.font = FONT_S;
      ctx.textAlign = 'left';
      const lines = [
        ['CH — Cantor, 1878', P.crimson],
        ['nothing strictly between?', P.crimson],
        ['Hilbert 1900: Problem 1', P.inkDim],
        ['Gödel 1940: not refutable (L)', P.inkDim],
        ['Cohen 1963: not provable (forcing)', P.inkDim],
        ['both relative to Con(ZFC)', P.inkFaint],
      ];
      let ty = (ys[0] + ys[1]) / 2 - 18;
      for (const [txt, col] of lines) {
        ctx.fillStyle = col;
        ctx.fillText(txt, gx + 12, ty);
        ty += 14;
      }
    }

    /* ---------- drawing: forcing ---------- */

    function drawForcing() {
      const { W, H } = handle;
      const ctx = handle.ctx;
      ctx.clearRect(0, 0, W, H);
      const g = fGround || rows;
      const CE = 20, GUT2 = 150;
      const shown = Math.min(g.length, 8);
      const visC = Math.max(4, Math.floor((W - GUT2 - 12) / CE));
      const off = Math.max(0, fCond.length - visC + 6);
      ctx.textBaseline = 'middle';
      ctx.font = FONT_S;
      // ground rows
      for (let j = 0; j < shown; j++) {
        const y = 26 + j * CE;
        const rule = g[j];
        ctx.textAlign = 'left';
        ctx.fillStyle = rule.type === 'diagonal' ? P.crimson : P.inkDim;
        ctx.fillText(fit(ctx, `row ${j} · ${rule.label}`, GUT2 - 14), 8, y + CE / 2);
        ctx.textAlign = 'center';
        for (let c = 0; c < visC; c++) {
          const i = off + c;
          const x = GUT2 + c * CE;
          if (x + CE > W) break;
          const v = rule.eval(BigInt(i));
          if (v) { ctx.fillStyle = P.goldDim + '28'; ctx.fillRect(x + 1, y + 1, CE - 2, CE - 2); }
          ctx.fillStyle = v ? P.inkDim : P.inkFaint;
          ctx.fillText(String(v), x + CE / 2, y + CE / 2 + 0.5);
          // mismatch with the condition, once locked in
          if (i < fCond.length && fCond[i] !== v) {
            ctx.strokeStyle = P.crimson + 'aa';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(x + 1.5, y + 1.5, CE - 3, CE - 3);
          }
        }
      }
      if (g.length > shown) {
        ctx.textAlign = 'left';
        ctx.fillStyle = P.inkFaint;
        ctx.fillText(`… and ${g.length - shown} more rows — the cards cover them too`, 8, 26 + shown * CE + 10);
      }
      // the condition strip
      const yC = 26 + shown * CE + 30;
      ctx.textAlign = 'left';
      ctx.fillStyle = P.azure;
      ctx.fillText(fit(ctx, 'your condition (finite; only ever grows)', GUT2 - 14), 8, yC + CE / 2);
      ctx.textAlign = 'center';
      for (let c = 0; c < visC; c++) {
        const i = off + c;
        const x = GUT2 + c * CE;
        if (x + CE > W) break;
        if (i < fCond.length) {
          ctx.fillStyle = fCond[i] ? P.azure + '44' : P.azure + '18';
          ctx.fillRect(x + 1, yC + 1, CE - 2, CE - 2);
          ctx.fillStyle = P.ink;
          ctx.fillText(String(fCond[i]), x + CE / 2, yC + CE / 2 + 0.5);
        } else {
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = P.line;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1.5, yC + 1.5, CE - 3, CE - 3);
          ctx.setLineDash([]);
        }
      }
      // column indices
      ctx.fillStyle = P.inkFaint;
      for (let c = 0; c < visC; c += 4) {
        const x = GUT2 + c * CE;
        if (x + CE > W) break;
        ctx.fillText(String(off + c), x + CE / 2, yC + CE + 12);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = P.inkFaint;
      ctx.fillText('crimson boxes: mismatches already locked in — no extension can undo them', 8, yC + CE + 32);
    }

    /* ---------- pointer interaction ---------- */

    const cvEl = handle.canvas;
    cvEl.style.cursor = 'grab';
    let pDown = null, draggedFar = false;

    function handleClick(x, y) {
      const { stripY, visRows, visCols } = gridMetrics();
      if (x < GUT) return;
      const c = Math.floor((x - GUT) / CELL + view.fx);
      if (c < 0 || c > visCols) return;
      const n = view.col + BigInt(c);
      if (revealed && y >= stripY && y <= stripY + CELL) {
        focusN = n;
        explainDiag(n, true);
        dirty = true;
        return;
      }
      if (y < HEAD || y > stripY - 10) return;
      const r = Math.floor((y - HEAD) / CELL + view.fy);
      if (r < 0 || r > visRows) return;
      const m = view.row + BigInt(r);
      const rule = enumAt(rows, m);
      if (rule.type === 'paint') {
        audio.ensureAudio();
        const idx = Number(n % 64n);
        rule.bits[idx] ^= 1;
        listChanged();
        audio.playTone(bus, { freq: rule.bits[idx] ? 587 : 294, dur: 0.07, level: 0.28 });
        readout.set(`painted bit ${idx} of the 64-cycle to ${rule.bits[idx]}` +
          (revealed ? (m === n ? ' — and d(n) flipped with it: the diagonal is a live computation'
                              : ' — the diagonal already knows') : ''));
        return;
      }
      if (m === n && revealed) {
        focusN = n;
        explainDiag(n, true);
        dirty = true;
        return;
      }
      explainCell(m, n);
      dirty = true;
    }

    function panBy(dc, dr) {
      view.fx += dc;
      view.fy += dr;
      while (view.fx < 0) {
        if (view.col > 0n) { view.col -= 1n; view.fx += 1; } else { view.fx = 0; break; }
      }
      while (view.fx >= 1) { view.col += 1n; view.fx -= 1; }
      while (view.fy < 0) {
        if (view.row > 0n) { view.row -= 1n; view.fy += 1; } else { view.fy = 0; break; }
      }
      while (view.fy >= 1) { view.row += 1n; view.fy -= 1; }
      dirty = true;
    }

    const onDown = (e) => {
      if (mode !== 'list') return;
      pDown = { x: e.clientX, y: e.clientY };
      draggedFar = false;
      try { cvEl.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = (e) => {
      if (!pDown) return;
      const dx = e.clientX - pDown.x, dy = e.clientY - pDown.y;
      if (!draggedFar && Math.hypot(dx, dy) > 4) draggedFar = true;
      if (draggedFar) {
        panBy(-dx / CELL, -dy / CELL);
        pDown = { x: e.clientX, y: e.clientY };
      }
    };
    const onUp = (e) => {
      if (!pDown) return;
      try { cvEl.releasePointerCapture(e.pointerId); } catch {}
      const wasDrag = draggedFar;
      pDown = null;
      draggedFar = false;
      if (wasDrag) return;
      const rect = cvEl.getBoundingClientRect();
      handleClick(e.clientX - rect.left, e.clientY - rect.top);
    };
    cvEl.addEventListener('pointerdown', onDown);
    cvEl.addEventListener('pointermove', onMove);
    cvEl.addEventListener('pointerup', onUp);
    cvEl.addEventListener('pointercancel', onUp);

    /* ---------- the loop ---------- */

    const loop = cv.rafLoop((dt) => {
      if (anim) {
        anim.t += dt;
        dirty = true;
        if (anim.t >= anim.dur) finishAbsorb();
      }
      if (pulse > 0) {
        pulse = Math.max(0, pulse - dt * 1.4);
        dirty = true;
      }
      const actx = audio.getContext();
      const now = actx ? actx.currentTime : 0;
      while (edgeQueue.length && edgeQueue[0].at <= now) {
        playN = edgeQueue.shift().n;
        dirty = true;
      }
      if (player && !player.playing && edgeQueue.length === 0) {
        player = null;
        playN = null;
        soundBtn.textContent = '▶ sound the diagonal';
        dirty = true;
      }
      if (!dirty) return;
      if (mode === 'list') drawList();
      else if (mode === 'tower') drawTower();
      else drawForcing();
      dirty = false;
    });

    modeBtns.list.classList.add('active');
    updateTexts();
    loop.start();

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        stopPlay();
        bus.mute();
      },
      resume() {
        bus.unmute();
        dirty = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        stopPlay();
        bus.dispose();
        cvEl.removeEventListener('pointerdown', onDown);
        cvEl.removeEventListener('pointermove', onMove);
        cvEl.removeEventListener('pointerup', onUp);
        cvEl.removeEventListener('pointercancel', onUp);
        handle.destroy();
        style.remove();
      },
    };
  },
};

/* ================= node-testable exports ================= */

export const _test = {
  rules,
  enumAt,
  makeDiagonal,
  modPow,
  popParity,
  isqrt,
  isPrime,
  champBit,
  parseIndex,
  fmtIdx,
  starterRows,
  MAX_IDX,
};
