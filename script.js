/*
  Art work description — typographic fireworks.
  Vanilla JS, no dependencies.

  Every word has a launch moment (a scroll progress value between 0 and 1).
  Before it launches it goes wrong in place (font, colour, alignment, letters
  drifting apart) — that part is a pure function of the scroll position.

  When the scroll passes its launch moment the word leaves the paragraph.
  Theory words (and some others) become real fireworks: the word shoots up
  along a curve with a glowing trail, pauses at the apex and explodes into
  luminous particles, streaks, letters and punctuation that slow down, fall
  under gravity and fade — with a synthesized pop / boom / crackle.
  Other words fizzle in place as small sparks.

  Fireworks play in real time once launched (like real fireworks); every
  parameter comes from a seeded generator, so each word always produces
  the same firework.
*/
(() => {
  'use strict';

  /* ------------------------------------------------------------------
     CONFIG — the main knobs (see README.md)
     ------------------------------------------------------------------ */
  const CONFIG = {
    seed: 2024,           // change for a different (still fixed) composition
    // How many words have left the text by a given scroll progress: [share of words, progress].
    launchCurve: [[0, 0.05], [0.1, 0.12], [0.38, 0.3], [0.68, 0.55], [0.9, 0.72], [1, 0.84]],
    calmUntil: 0.04,      // nothing changes before this progress
    clearAt: 0.9,         // everything is gone; only the final sentence remains
    smoothing: 7,         // how quickly the text catches up with the scroll (higher = snappier)
    maxRockets: 5,        // simultaneous full fireworks on phones (one more on big screens)
    rocketShare: 0.22,    // share of ordinary words that try to become full fireworks (theory words always try)
    fireworkSize: 1,      // explosion radius multiplier
    sound: true,          // synthesized pops / booms / crackle (starts after the first touch, click or key)
    volume: 0.55,         // master volume, 0–1
  };

  const PASTELS = ['yellow', 'pink', 'blue', 'green', 'lilac', 'red'];
  // Glow colours (r,g,b) — a more luminous version of each pastel.
  const GLOW = {
    yellow: '255,200,64', pink: '255,92,160', blue: '56,196,255',
    green: '36,214,168', lilac: '158,108,255', red: '255,78,96', warm: '255,214,150',
  };
  const BURSTS = ['chrysanthemum', 'peony', 'starburst', 'willow', 'partial', 'ring', 'letters', 'chrysanthemum', 'peony'];
  const FONTS = ['f-serif', 'f-times', 'f-serif', 'f-mono', 'f-courier', 'f-pixel', 's-italic', 's-thin'];
  const STYLES = ['s-italic', 's-bold', 's-spaced', 's-tight', 's-big', 's-small'];
  const PUNCT = [',', '.', ';', ':', '?', '!', '·', '—', '(', ')', '*', '/', '“', '”', '&'];

  // Theory words always try to become full fireworks.
  const POSH = new Set((
    'performativity recursive redistribution authorship computational affective interiority ' +
    'relational protocol infrastructural architecture representation prosthesis autonomous ' +
    'provisional apparatus negotiated displaced rehearsed ontological overdetermined residues ' +
    'anthropomorphic incompleteness generative excess embodiment indeterminacy contingent ' +
    'noncompliant assemblage actuators toolness instrumental discrepancy banality vocabulary ' +
    'recognizability virtuosity self-consciousness phenomenon simulation citation affective ' +
    'paradox infrastructure contradiction delegation substitution contingency insufficiency ' +
    'operational purposelessness mediation theoretical stability resolution reactivate ' +
    'performative non-resolution articulated choreography infrastructurally deferred'
  ).split(' '));

  /* ------------------------------------------------------------------
     helpers
     ------------------------------------------------------------------ */
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const easeOut2 = (x) => 1 - (1 - x) * (1 - x);
  const sign = (rng) => (rng() < 0.5 ? -1 : 1);
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const range = (rng, a, b) => a + rng() * (b - a);

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rngFor(key) {
    let a = (hash(String(key)) ^ CONFIG.seed) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function launchAt(u) {
    const k = CONFIG.launchCurve;
    for (let i = 1; i < k.length; i++) {
      if (u <= k[i][0]) {
        const [u0, p0] = k[i - 1], [u1, p1] = k[i];
        return p0 + (p1 - p0) * (u - u0) / (u1 - u0);
      }
    }
    return k[k.length - 1][1];
  }
  function span(cls, text) {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    return el;
  }

  /* ------------------------------------------------------------------
     DOM
     ------------------------------------------------------------------ */
  const scroller = document.querySelector('.scroller');
  const article = document.getElementById('statement');
  const finalEl = document.getElementById('final');
  const canvas = document.querySelector('.sky');
  const ctx = canvas.getContext('2d');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motion = !motionQuery.matches;

  /* ------------------------------------------------------------------
     words
     ------------------------------------------------------------------ */
  const words = [];
  const paras = Array.from(article.querySelectorAll('p'));
  const totalChars = paras.reduce((n, p) => n + p.textContent.length, 0);
  let charPos = 0;
  let lastCount = 0;

  function parseForced(spec) {
    const o = {};
    spec.split(/\s+/).filter(Boolean).forEach((tok) => {
      const [k, v] = tok.split(':');
      o[k] = v == null ? true : v;
    });
    return o;
  }

  function stretchFor(i) {
    const r = rngFor('sx' + i);
    if (r() >= 0.22) return 1;
    return r() < 0.5 ? range(r, 0.55, 0.8) : range(r, 1.25, 1.75);
  }

  function makeWord(text, forced) {
    const i = words.length;
    const rng = rngFor(i + ':' + text);
    const f = forced ? parseForced(forced) : {};
    const frac = charPos / totalChars;
    const bare = text.toLowerCase().replace(/[^a-z-]/g, '');
    const posh = POSH.has(bare);

    // --- when does it leave? (earlier for theory words, roughly in reading order)
    let u = 0.55 * rng() + 0.45 * frac;
    if (posh) u *= 0.7;
    let L = launchAt(clamp(u));
    if (f.launch) L = parseFloat(f.launch);
    if (f.last) { L = 0.8 + lastCount * 0.009; lastCount++; }

    // --- how it goes wrong before leaving
    const pre0 = f.last ? Math.max(CONFIG.calmUntil, L - 0.35)
      : Math.max(CONFIG.calmUntil + rng() * 0.05, L - range(rng, 0.05, 0.35));
    const cls = [];
    if (f.font) cls.push('f-' + f.font);
    else if (rng() < 0.58) {
      cls.push(pick(rng, FONTS));
      if (rng() < 0.3) cls.push(pick(rng, STYLES));
    }
    const rocket = !!(f.burst || f.last || posh || rng() < CONFIG.rocketShare);
    let color = f.pastel || (rng() < 0.62 ? pick(rng, PASTELS) : null);
    if (rocket && !color) color = pick(rng, PASTELS);
    const n = Array.from(text).length;
    let letterMode = null;
    if (n >= 4 && rng() < 0.18) letterMode = pick(rng, ['spread', 'bend', 'detach', 'spread']);

    const w = {
      i, text, L, pre0, posh, last: !!f.last, rocket, pop: f.mode === 'pop',
      cls, fontAt: rng() * 0.7, color, colAt: rng() * 0.75,
      jit: rng() < 0.85 ? { dx: range(rng, -9, 9), dy: range(rng, -11, 11), rot: range(rng, -22, 22) } : null,
      sx: stretchFor(i), // compressed / stretched
      letterMode, lk: range(rng, 0.6, 1.6) * sign(rng), lph: rng() * TAU, detIdx: 1 + Math.floor(rng() * (n - 1)),
      // firework recipe
      burst: f.burst || pick(rng, BURSTS),
      c1: color || pick(rng, PASTELS), c2: pick(rng, PASTELS),
      size: (posh ? 1.15 : 1) * range(rng, 0.75, 1.2),
      drift: range(rng, -0.3, 0.3), bend: sign(rng) * range(rng, 0.1, 0.35),
      seed: Math.floor(rng() * 1e9),
      // runtime
      el: null, letters: null, fired: false,
      s: { cls: false, col: false, glow: false, tr: null, hide: false, ltr: null },
    };
    if (w.c2 === w.c1) w.c2 = PASTELS[(PASTELS.indexOf(w.c1) + 2) % PASTELS.length];
    if (w.burst === 'willow' && rng() < 0.6) w.c1 = 'yellow';

    const el = span('w', '');
    if (letterMode) {
      w.letters = Array.from(text).map((ch) => { const l = span('l', ch); el.append(l); return l; });
    } else el.textContent = text;
    if (color) {
      el.style.setProperty('--cc', `var(--${color})`);
      el.style.setProperty('--gc', GLOW[color]);
    }
    w.el = el;
    words.push(w);
    return el;
  }

  paras.forEach((p) => {
    const frag = document.createDocumentFragment();
    Array.from(p.childNodes).forEach((node) => {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.append(' ');
          else frag.append(makeWord(part, null));
          charPos += part.length;
        });
      } else if (node.nodeType === 1) {
        const txt = node.textContent.trim();
        if (txt) frag.append(makeWord(txt, node.dataset.fx || ''));
        charPos += node.textContent.length;
      }
    });
    p.textContent = '';
    p.append(frag);
  });

  // Neighbouring words that trade places before they leave.
  const swapPairs = [];
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i + 1];
    if (a.last || b.last) continue;
    if (rngFor('swap' + i)() < 0.07) {
      const at = Math.max(CONFIG.calmUntil + 0.01, Math.min(a.L, b.L) - 0.07);
      swapPairs.push({ a, b, at });
      i++;
    }
  }

  /* ------------------------------------------------------------------
     sound — synthesized with Web Audio, unlocked by the first interaction
     ------------------------------------------------------------------ */
  const Sound = (() => {
    let ac = null, master = null, noise = null, lastAt = 0, hushed = false;

    function init() {
      if (ac || !CONFIG.sound) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 5;
      comp.attack.value = 0.002; comp.release.value = 0.25;
      master = ac.createGain();
      master.gain.value = CONFIG.volume;
      master.connect(comp);
      comp.connect(ac.destination);
      const len = Math.floor(ac.sampleRate * 2);
      noise = ac.createBuffer(1, len, ac.sampleRate);
      const d = noise.getChannelData(0);
      const r = rngFor('noise');
      for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    }

    const EVENTS = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click', 'wheel', 'scroll'];
    let lastTry = 0;
    function unlock() {
      const now = performance.now();
      if (now - lastTry < 250) return;
      lastTry = now;
      init();
      if (!ac) return;
      if (ac.state !== 'running') {
        const p = ac.resume();
        if (p && p.catch) p.catch(() => {});
        // iOS needs something to actually play inside the gesture
        const b = ac.createBuffer(1, 1, 22050);
        const s = ac.createBufferSource();
        s.buffer = b; s.connect(ac.destination); s.start(0);
      }
      if (ac.state === 'running') EVENTS.forEach((e) => window.removeEventListener(e, unlock, true));
    }
    EVENTS.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));

    const ready = () => ac && ac.state === 'running' && !hushed;

    function noiseInto(node, t, dur) {
      const s = ac.createBufferSource();
      s.buffer = noise;
      s.connect(node);
      s.start(t, Math.random() * 1.2, dur);
    }

    function env(g, t, peak, attack, decay) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }

    // size ≈ 0.4 (tiny pop) … 1.4 (big boom); pan −1…1
    function burst(size, pan, crackle, rng, willow) {
      if (!ready()) return;
      const nowT = ac.currentTime;
      if (nowT - lastAt < 0.06) return; // never a wall of sound
      lastAt = nowT;
      const t = nowT + 0.004;
      const out = ac.createGain();
      out.gain.value = 1;
      if (ac.createStereoPanner) {
        const p = ac.createStereoPanner();
        p.pan.value = clamp(pan, -0.8, 0.8);
        out.connect(p); p.connect(master);
      } else out.connect(master);

      const big = size > 0.85;
      // body: filtered noise that closes down
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.7;
      const f0 = big ? range(rng, 900, 1700) : range(rng, 2400, 4600);
      lp.frequency.setValueAtTime(f0, t);
      lp.frequency.exponentialRampToValueAtTime(big ? range(rng, 70, 120) : range(rng, 300, 600), t + (big ? 0.9 : 0.22));
      const g = ac.createGain();
      const dec = big ? range(rng, 0.9, 1.5) * (willow ? 1.4 : 1) : range(rng, 0.14, 0.28);
      env(g, t, (0.35 + 0.45 * size) * range(rng, 0.8, 1.1), 0.003, dec);
      lp.connect(g); g.connect(out);
      noiseInto(lp, t, dec + 0.05);

      // sharp crack on top
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = range(rng, 1800, 3500);
      const gc = ac.createGain();
      env(gc, t, big ? 0.25 : 0.4, 0.001, range(rng, 0.03, 0.07));
      hp.connect(gc); gc.connect(out);
      noiseInto(hp, t, 0.1);

      // deep thump for large bursts
      if (big) {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(range(rng, 85, 120), t);
        o.frequency.exponentialRampToValueAtTime(range(rng, 32, 45), t + 0.35);
        const go = ac.createGain();
        env(go, t, 0.55 * size, 0.004, range(rng, 0.4, 0.6));
        o.connect(go); go.connect(out);
        o.start(t); o.stop(t + 0.75);
      }

      // delayed crackle / sparkle
      if (crackle) {
        const count = 12 + Math.floor(rng() * (willow ? 34 : 24));
        const start = range(rng, 0.45, 0.75);
        for (let i = 0; i < count; i++) {
          const tt = t + start + Math.pow(rng(), 1.6) * (willow ? 1.6 : 0.9);
          const bp = ac.createBiquadFilter();
          bp.type = willow ? 'bandpass' : 'highpass';
          bp.frequency.value = range(rng, 2500, 7000);
          const gg = ac.createGain();
          env(gg, tt, range(rng, 0.03, willow ? 0.06 : 0.11), 0.001, range(rng, 0.012, 0.035));
          bp.connect(gg); gg.connect(out);
          noiseInto(bp, tt, 0.05);
        }
      }
    }

    function hush(on) {
      if (on === hushed) return;
      hushed = on;
      if (!ac || !master) return;
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(on ? 0 : CONFIG.volume, t + (on ? 0.25 : 0.05));
    }

    return { burst, hush };
  })();

  /* ------------------------------------------------------------------
     glow sprites (pre-rendered radial gradients, drawn additively)
     ------------------------------------------------------------------ */
  const SPRITES = {};
  function makeSprite(rgb, whiteCore) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, whiteCore ? 'rgba(255,255,255,1)' : `rgba(${rgb},1)`);
    gr.addColorStop(0.16, `rgba(${rgb},0.95)`);
    gr.addColorStop(0.42, `rgba(${rgb},0.32)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  }
  Object.keys(GLOW).forEach((k) => {
    SPRITES[k] = makeSprite(GLOW[k], true);
    SPRITES[k + ':solid'] = makeSprite(GLOW[k], false);
  });

  /* ------------------------------------------------------------------
     fireworks
     ------------------------------------------------------------------ */
  let vw = 0, vh = 0, dpr = 1, maxScroll = 1, shiftMax = 0, unit = 1, vmin = 400;

  const fireworks = [];
  let lastRocketAt = -1e9;

  // Particle position with linear drag k and gravity g (closed form, so it is
  // exact at any frame rate): x = v(1 − e^(−kτ))/k, y adds g(τ − (1 − e^(−kτ))/k)/k
  function pos(fw, q, tau) {
    const e = (1 - Math.exp(-q.k * tau)) / q.k;
    return [fw.bx + q.vx * e, fw.by + q.vy * e + q.g * (tau - e) / q.k];
  }

  function buildBurst(fw, w, rng) {
    const P = [];
    const R = fw.R;
    const col = () => { const u = rng(); return u < 0.66 ? w.c1 : u < 0.93 ? w.c2 : 'warm'; };
    const sphere = (k, scale, o) => { // uniform on a sphere, projected: dense rim like real shells
      const th = rng() * TAU, z = rng() * 2 - 1, f = Math.sqrt(1 - z * z) * scale;
      const V = R * k * f;
      return Object.assign({ vx: Math.cos(th) * V, vy: Math.sin(th) * V, k }, o);
    };
    let type = w.burst;

    if (type === 'chrysanthemum') {
      const n = 62 + Math.floor(rng() * 26);
      for (let i = 0; i < n; i++) P.push(sphere(1.9, range(rng, 0.9, 1), { kind: 'streak', d: 0.16, g: R * 0.55, life: range(rng, 1.4, 1.85), c: col(), z: range(rng, 2, 3), crackle: rng() < 0.35 }));
    } else if (type === 'peony') {
      const n = 54 + Math.floor(rng() * 22);
      for (let i = 0; i < n; i++) P.push(sphere(2.3, range(rng, 0.92, 1), { kind: 'dot', g: R * 0.5, life: range(rng, 1.05, 1.4), c: col(), z: range(rng, 2.6, 3.8), crackle: rng() < 0.12 }));
    } else if (type === 'starburst') {
      fw.R = R * 0.55;
      const n = 22 + Math.floor(rng() * 12);
      for (let i = 0; i < n; i++) P.push(sphere(3.2, range(rng, 0.5, 1) * 0.55, { kind: 'streak', d: 0.07, g: R * 0.4, life: range(rng, 0.6, 0.85), c: col(), z: range(rng, 1.6, 2.4) }));
    } else if (type === 'willow') {
      const n = 42 + Math.floor(rng() * 16);
      for (let i = 0; i < n; i++) P.push(sphere(2.8, range(rng, 0.85, 1), { kind: 'willow', d: 0.36, g: R * 1.25, life: range(rng, 2.1, 2.8), c: rng() < 0.75 ? w.c1 : 'warm', z: range(rng, 1.6, 2.3), crackle: rng() < 0.25 }));
    } else if (type === 'partial') {
      const span = range(rng, 1.7, 3.4), mid = rng() * TAU;
      const n = 40 + Math.floor(rng() * 16);
      for (let i = 0; i < n; i++) {
        const th = mid + (rng() - 0.5) * span, V = R * 2 * range(rng, 0.5, 1);
        P.push({ vx: Math.cos(th) * V, vy: Math.sin(th) * V, k: 2, kind: 'streak', d: 0.12, g: R * 0.5, life: range(rng, 1.1, 1.5), c: col(), z: range(rng, 2, 3) });
      }
    } else if (type === 'ring') {
      const n = 40 + Math.floor(rng() * 12), tilt = range(rng, 0.3, 0.8), rot = rng() * TAU;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU, V = R * 2.1 * range(rng, 0.96, 1.02);
        const lx = Math.cos(th) * V, ly = Math.sin(th) * V * tilt;
        P.push({ vx: lx * cr - ly * sr, vy: lx * sr + ly * cr, k: 2.1, kind: 'dot', g: R * 0.45, life: range(rng, 1.15, 1.45), c: col(), z: range(rng, 2.4, 3.4) });
      }
      for (let i = 0; i < 14; i++) P.push(sphere(2.6, 0.35, { kind: 'dot', g: R * 0.4, life: range(rng, 0.8, 1.1), c: 'warm', z: 2.4 }));
    } else { // letters: typographic shell
      type = 'letters';
      const n = 30 + Math.floor(rng() * 10);
      for (let i = 0; i < n; i++) P.push(sphere(2.2, range(rng, 0.8, 1), { kind: 'dot', g: R * 0.5, life: range(rng, 1.1, 1.5), c: col(), z: range(rng, 2, 3) }));
    }

    // typography mixed into every shell: the word's own letters, punctuation, short lines
    const chars = fw.chars.filter((ch) => ch.trim());
    const reps = type === 'letters' ? 2 : 1;
    for (let r = 0; r < reps; r++) {
      chars.slice(0, 12).forEach((ch) => P.push(sphere(2.1, range(rng, 0.3, 0.95), {
        kind: 'glyph', ch, g: R * 0.6, life: range(rng, 1.2, 1.7), c: col(), z: range(rng, 0.9, 1.45), spin: range(rng, -3, 3),
      })));
    }
    const np = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < np; i++) P.push(sphere(2.1, range(rng, 0.4, 1), { kind: 'glyph', ch: pick(rng, PUNCT), serif: true, g: R * 0.6, life: range(rng, 1, 1.5), c: col(), z: range(rng, 1, 1.6), spin: range(rng, -4, 4) }));
    for (let i = 0; i < 5; i++) P.push(sphere(2.2, range(rng, 0.5, 1), { kind: 'streak', d: 0.05, g: R * 0.5, life: range(rng, 0.8, 1.2), c: col(), z: 2.8 }));

    fw.life = P.reduce((m, q) => Math.max(m, q.life), 0) + 0.1;
    fw.type = type;
    return P;
  }

  function spawn(w, kind, now) {
    const r = w.el.getBoundingClientRect();
    if (r.bottom < -10 || r.top > vh + 10) return; // offscreen words just leave quietly
    const cs = getComputedStyle(w.el);
    const rng = rngFor('fw' + w.seed);
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const fontSize = parseFloat(cs.fontSize);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
    ctx.font = font;
    const chars = Array.from(w.text);
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);

    const fw = {
      kind, w, t0: now, x0, y0, font, fontSize, family: cs.fontFamily, chars, widths, total,
      c1: w.c1, c2: w.c2, seed: w.seed, boomed: false,
    };

    if (kind === 'spark' || !motion) {
      // small fizzle in place: a few glowing dots and the letters dropping like embers
      fw.kind = motion ? 'spark' : 'still';
      fw.bx = x0; fw.by = y0; fw.A = 0; fw.H = 0;
      fw.R = (motion ? 22 : 30) * unit;
      fw.parts = [];
      const n = motion ? 3 + Math.floor(rng() * 4) : 8;
      for (let i = 0; i < n; i++) {
        const th = rng() * TAU, V = fw.R * 3 * range(rng, 0.5, 1);
        fw.parts.push({ vx: Math.cos(th) * V, vy: Math.sin(th) * V, k: 3, g: fw.R * 2, kind: 'dot', life: range(rng, 0.35, 0.7), c: rng() < 0.7 ? w.c1 : w.c2, z: range(rng, 1, 1.6) });
      }
      let acc = -total / 2;
      chars.forEach((ch, j) => {
        const x = acc + widths[j] / 2; acc += widths[j];
        fw.parts.push({ ox: x, vx: x * 1.5 + range(rng, -20, 20), vy: -range(rng, 20, 70), k: 1.4, g: 260 * unit, kind: 'glyph', ch, life: range(rng, 0.7, 1.1), c: w.c1, z: 1, spin: range(rng, -2, 2) });
      });
      fw.life = 1.2;
      if (kind === 'rocket') { // reduced motion: a still bloom stands in for the firework
        fw.R = 40 * unit;
        Sound.burst(0.7, (x0 / vw) * 2 - 1, false, rng, false);
      }
      fireworks.push(fw);
      return;
    }

    // full firework
    fw.R = clamp(vmin * range(rng, 0.2, 0.3) * w.size * CONFIG.fireworkSize, 50, 300);
    const pop = w.pop || y0 < vh * 0.24;
    if (pop) {
      fw.A = 0; fw.H = 0; fw.ax = x0; fw.ay = y0;
    } else {
      fw.A = range(rng, 0.55, 0.85);
      fw.H = range(rng, 0.07, 0.14);
      fw.ax = clamp(x0 + w.drift * vw * 0.6, vw * 0.14, vw * 0.86);
      fw.ay = clamp(y0 - vh * range(rng, 0.2, 0.45), vh * 0.12, y0 - vh * 0.12);
    }
    fw.cx = (x0 + fw.ax) / 2 + w.bend * (y0 - fw.ay);
    fw.cy = (y0 + fw.ay) / 2;
    fw.bx = fw.ax; fw.by = fw.ay;
    fw.len = Math.hypot(fw.ax - x0, fw.ay - y0) + 1;
    fw.parts = buildBurst(fw, w, rng);
    fw.flash = rng() < 0.5 ? w.c1 : 'warm';
    fw.rng = rng;
    fireworks.push(fw);
    lastRocketAt = now;
  }

  /* ------------------------------------------------------------------
     drawing
     ------------------------------------------------------------------ */
  const bez = (a, c, b, t) => { const u = 1 - t; return u * u * a + 2 * u * t * c + t * t * b; };
  const bezD = (a, c, b, t) => 2 * (1 - t) * (c - a) + 2 * t * (b - c);
  let curFont = '';
  let fade = 1;

  function setFont(f) { if (f !== curFont) { ctx.font = f; curFont = f; } }
  function rotAt(x, y, a) {
    const c = Math.cos(a) * dpr, s = Math.sin(a) * dpr;
    ctx.setTransform(c, s, -s, c, x * dpr, y * dpr);
  }
  function glow(key, x, y, r, a) {
    if (a <= 0.01) return;
    ctx.globalAlpha = a * fade;
    ctx.drawImage(SPRITES[key], x - r, y - r, r * 2, r * 2);
  }
  const rgba = (key, a) => `rgba(${GLOW[key]},${(a * fade).toFixed(3)})`;
  const lifeAlpha = (x) => (x < 0.45 ? 1 : 1 - Math.pow((x - 0.45) / 0.55, 1.6));
  const ascent = (u) => u * u * (0.55 + 0.45 * u); // accelerating climb

  function drawRocket(fw, t) {
    const s = t < fw.A ? ascent(t / fw.A) : 1;
    const P = (ss) => [bez(fw.x0, fw.cx, fw.ax, ss), bez(fw.y0, fw.cy, fw.ay, ss)];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // glowing trail of sparks, sagging and fading behind the head
    for (let k = 1; k <= 16; k++) {
      const tk = t - k * 0.026;
      if (tk <= 0) break;
      const sk = tk < fw.A ? ascent(tk / fw.A) : 1;
      if (sk < 0.02) continue;
      const [x, y] = P(sk);
      const jx = Math.sin(k * 2.7 + fw.seed) * k * 0.35;
      glow(k % 4 === 0 ? fw.c1 : 'warm', x + jx, y + k * k * 0.18 * unit, (5.2 - k * 0.26) * unit, (1 - k / 17) * 0.85);
    }

    // the word itself: peels off the line, stretches along the path, then frays
    if (t < fw.A) {
      const u = t / fw.A;
      const m = easeOut2(clamp(u / 0.3));
      const stretch = 1 + 1.6 * s;
      const fray = clamp((s - 0.45) / 0.5);
      const a = 1 - fray;
      if (a > 0.02) {
        setFont(fw.font);
        ctx.fillStyle = rgba(fw.c1, a);
        let acc = 0, accL = -fw.total / 2;
        const n = fw.chars.length;
        const left = [];
        for (let j = 0; j < n; j++) { left.push(accL + fw.widths[j] / 2); accL += fw.widths[j]; }
        for (let j = n - 1; j >= 0; j--) {
          const back = (acc + fw.widths[j] / 2) * stretch / fw.len;
          acc += fw.widths[j];
          const ss = s - back;
          const px = bez(fw.x0, fw.cx, fw.ax, ss), py = bez(fw.y0, fw.cy, fw.ay, ss);
          const ang = Math.atan2(bezD(fw.y0, fw.cy, fw.ay, ss), bezD(fw.x0, fw.cx, fw.ax, ss));
          const hx = fw.x0 + left[j], hy = fw.y0;
          const drop = fray * fray * 30 * unit * (1 + (j % 3));
          rotAt(hx + (px - hx) * m, hy + (py - hy) * m + drop, ang * m);
          ctx.fillText(fw.chars[j], 0, 0);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    // bright head; pulses during the pause at the apex
    const [hx, hy] = P(s);
    const hold = t >= fw.A ? Math.sin(((t - fw.A) / fw.H) * Math.PI) : 0;
    glow(fw.c1, hx, hy, (8 + 5 * s + 6 * hold) * unit, 0.95);
    glow('warm', hx, hy, (4 + 2 * hold) * unit, 1);
  }

  function drawBurst(fw, tau) {
    // flash
    if (tau < 0.32) {
      const f = 1 - tau / 0.32;
      glow(fw.flash + ':solid', fw.bx, fw.by, fw.R * (0.3 + 0.5 * (1 - f * f)), f * f * 0.45);
      glow(fw.c1, fw.bx, fw.by, fw.R * 0.09, f);
    }
    const lines = {};
    const late = Math.floor(performance.now() / 45);
    for (let i = 0; i < fw.parts.length; i++) {
      const q = fw.parts[i];
      if (tau >= q.life) continue;
      const x01 = tau / q.life;
      const a = lifeAlpha(x01);
      const [x, y] = pos(fw, q, tau);
      const hot = tau < 0.14; // white-hot for a moment, then pastel

      if (q.crackle && x01 > 0.55) { // secondary sparkles
        if (((i * 7 + late) * 2654435761 >>> 0) % 5 < 2) {
          glow('warm', x + Math.sin(i + late) * 4, y + Math.cos(i * 3 + late) * 4, 2.6 * unit, a);
          glow(q.c, x, y, 3.5 * unit, a * 0.6);
        }
        continue;
      }
      switch (q.kind) {
        case 'dot':
          glow(hot ? 'warm' : q.c, x, y, q.z * unit * (hot ? 3.2 : 2.4), a);
          break;
        case 'streak':
        case 'willow': {
          const segs = q.kind === 'willow' ? 4 : 1;
          const key = q.c;
          (lines[key] || (lines[key] = [])).push([q, x, y, a, segs]);
          glow(hot ? 'warm' : q.c, x, y, q.z * unit * (hot ? 2.6 : 1.8), a);
          break;
        }
        case 'glyph': {
          const sz = Math.round(fw.fontSize * q.z);
          setFont(q.serif ? `${sz}px "EB Garamond", serif` : `${sz}px ${fw.family}`);
          glow(q.c, x, y, sz * 0.75, a * 0.55);
          ctx.globalAlpha = 1;
          ctx.fillStyle = rgba(q.c, a);
          rotAt(x, y, q.spin * tau);
          ctx.fillText(q.ch, 0, 0);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          break;
        }
      }
    }
    // streak trails, batched per colour: a soft wide pass and a bright thin pass
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    for (const key in lines) {
      const list = lines[key];
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        let aSum = 0;
        for (const [q, x, y, a, segs] of list) {
          aSum += a;
          const d = q.d;
          ctx.moveTo(x, y);
          for (let sgi = 1; sgi <= segs; sgi++) {
            const [px, py] = pos(fw, q, Math.max(0, tau - (d * sgi) / segs));
            ctx.lineTo(px, py);
          }
        }
        const a = aSum / list.length;
        ctx.lineWidth = (pass ? 1.1 : 3.4) * unit;
        ctx.strokeStyle = rgba(key, pass ? a * 0.9 : a * 0.28);
        ctx.stroke();
      }
    }
  }

  function drawSmall(fw, tau) {
    for (const q of fw.parts) {
      if (tau >= q.life) continue;
      const a = lifeAlpha(tau / q.life);
      if (fw.kind === 'still') { // reduced motion: fixed bloom, only fading
        const th = Math.atan2(q.vy, q.vx);
        glow(q.c, fw.bx + Math.cos(th) * fw.R, fw.by + Math.sin(th) * fw.R, q.z * unit * 2.4, Math.sin(Math.PI * tau / q.life));
        continue;
      }
      const [x, y] = pos(fw, q, tau);
      if (q.kind === 'glyph') {
        setFont(fw.font);
        ctx.globalAlpha = 1;
        ctx.fillStyle = rgba(q.c, a);
        rotAt(x + (q.ox || 0) * (1 - Math.min(1, tau * 4)), y, q.spin * tau);
        ctx.fillText(q.ch, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else glow(q.c, x, y, q.z * unit * 2.2, a);
    }
  }

  /* ------------------------------------------------------------------
     measurement & progress
     ------------------------------------------------------------------ */
  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    vmin = Math.min(vw, vh);
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    maxScroll = Math.max(1, scroller.offsetHeight - vh);
    shiftMax = Math.max(0, article.offsetHeight - vh * 0.82);
    unit = clamp(vmin / 420, 0.85, 1.6);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.height = vh + 'px';
    const tr = document.createRange();
    tr.selectNodeContents(finalEl);
    const tb = tr.getBoundingClientRect();
    textBox = { l: tb.left - 12, r: tb.right + 12, t: tb.top - 10, b: tb.bottom + 10 };
    for (const sp of swapPairs) {
      const a = sp.a.el, b = sp.b.el;
      sp.ok = a.offsetTop === b.offsetTop;
      sp.dxA = b.offsetLeft + b.offsetWidth - a.offsetWidth - a.offsetLeft;
      sp.dxB = a.offsetLeft - b.offsetLeft;
    }
    words.forEach((w) => { w.s.tr = null; });
  }

  const target = () => clamp(window.scrollY / maxScroll);

  /* ------------------------------------------------------------------
     per-frame: words still in the text
     ------------------------------------------------------------------ */
  function setCls(w, on) {
    if (on === w.s.cls) return;
    w.s.cls = on;
    for (const c of w.cls) w.el.classList.toggle(c, on);
  }

  function updateInText(w, p, swapDx) {
    const q = clamp((p - w.pre0) / Math.max(0.001, w.L - w.pre0));
    setCls(w, q > w.fontAt && p > w.pre0);
    const colOn = !!w.color && q > w.colAt && p > w.pre0;
    if (colOn !== w.s.col) { w.s.col = colOn; w.el.classList.toggle('c-on', colOn); }
    const glowOn = w.rocket && colOn && q > 0.8;
    if (glowOn !== w.s.glow) { w.s.glow = glowOn; w.el.classList.toggle('glow', glowOn); }

    let tr = '';
    if (motion) {
      const q2 = q * q;
      let dx = swapDx, dy = 0, r = 0;
      if (w.jit) { dx += w.jit.dx * q2; dy += w.jit.dy * q2; r += w.jit.rot * q2; }
      const sx = 1 + (w.sx - 1) * q2;
      if (dx || dy || r || sx !== 1) tr = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${r.toFixed(1)}deg)` + (sx !== 1 ? ` scaleX(${sx.toFixed(3)})` : '');
    }
    if (tr !== w.s.tr) { w.el.style.transform = tr; w.s.tr = tr; }

    if (w.letters) {
      const key = motion ? Math.round(q * 60) : 0;
      if (key !== w.s.ltr) {
        w.s.ltr = key;
        const n = w.letters.length, c = (n - 1) / 2, qq = key / 60;
        w.letters.forEach((l, j) => {
          let x = 0, y = 0, r = 0;
          if (w.letterMode === 'spread') { x = (j - c) * 4 * qq * Math.abs(w.lk); y = Math.sin(j * 1.9 + w.lph) * 5 * qq; }
          else if (w.letterMode === 'bend') { y = w.lk * 1.4 * (j - c) * (j - c) * qq; r = w.lk * 7 * (j - c) * qq; }
          else if (j === w.detIdx) { y = -22 * qq * qq; x = w.lk * 8 * qq; r = w.lk * 40 * qq; }
          l.style.transform = x || y || r ? `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(0)}deg)` : '';
        });
      }
    }
    if (w.s.hide) { w.s.hide = false; w.el.classList.remove('hide'); }
  }

  /* ------------------------------------------------------------------
     finale — fireworks framing the final sentence
     ------------------------------------------------------------------ */
  const after = { on: false, t0: 0, next: 0, nextTiny: 0, rng: null, motes: [] };
  let textBox = { l: 0, r: 0, t: 0, b: 0 };
  const FINALE_WORDS = Array.from(POSH);
  const FINALE_BURSTS = ['chrysanthemum', 'peony', 'willow', 'ring', 'partial', 'chrysanthemum', 'peony', 'letters'];

  // distance from a point to the sentence's box (0 inside)
  function distToText(x, y) {
    const dx = Math.max(textBox.l - x, 0, x - textBox.r);
    const dy = Math.max(textBox.t - y, 0, y - textBox.b);
    return Math.hypot(dx, dy);
  }

  // a spot that frames the sentence: upper band, lower band or the sides
  function finaleSpot(r, R) {
    let best = null, bestD = -1;
    for (let i = 0; i < 16; i++) {
      const zone = r();
      let x, y;
      if (zone < 0.5) { x = range(r, 0.14, 0.86) * vw; y = range(r, 0.1, 0.3) * vh; }
      else if (zone < 0.72) { x = range(r, 0.16, 0.84) * vw; y = range(r, 0.68, 0.84) * vh; }
      else { x = (r() < 0.5 ? range(r, 0.08, 0.22) : range(r, 0.78, 0.92)) * vw; y = range(r, 0.18, 0.82) * vh; }
      const d = distToText(x, y);
      if (d > R * 0.75) return [x, y];
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    return best;
  }

  // full firework launched from a bottom corner, carrying a leftover theory word
  function spawnFinale(now) {
    const r = after.rng;
    const R = clamp(vmin * range(r, 0.22, 0.32) * CONFIG.fireworkSize, 70, 320);
    const [ax, ay] = finaleSpot(r, R);
    const c1 = pick(r, PASTELS);
    let c2 = pick(r, PASTELS);
    if (c2 === c1) c2 = PASTELS[(PASTELS.indexOf(c1) + 3) % PASTELS.length];
    const pseudo = { burst: pick(r, FINALE_BURSTS), c1, c2 };
    if (pseudo.burst === 'willow') pseudo.c1 = 'yellow';

    if (!motion) { // reduced motion: a still bloom where the burst would be
      const fw = { kind: 'still', after: true, t0: now, bx: ax, by: ay, R: R * 0.45, parts: [], life: 1.6 };
      for (let i = 0; i < 14; i++) {
        const th = (i / 14) * TAU;
        fw.parts.push({ vx: Math.cos(th), vy: Math.sin(th), k: 1, g: 0, kind: 'dot', life: 1.6, c: i % 3 ? c1 : c2, z: 2 });
      }
      fireworks.push(fw);
      return;
    }

    const text = pick(r, FINALE_WORDS);
    const fontSize = Math.round(15 * unit);
    const font = `italic 400 ${fontSize}px "EB Garamond", serif`;
    ctx.font = font;
    const chars = Array.from(text);
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const x0 = ax < vw / 2 ? range(r, 0.04, 0.3) * vw : range(r, 0.7, 0.96) * vw;
    const y0 = vh + 20;
    const fw = {
      kind: 'rocket', after: true, t0: now, x0, y0, ax, ay, bx: ax, by: ay,
      cx: (x0 + ax) / 2 + range(r, -0.12, 0.12) * vw, cy: (y0 + ay) / 2,
      A: range(r, 0.75, 1.05), H: range(r, 0.08, 0.14), R,
      font, fontSize, family: '"EB Garamond", serif', chars, widths, total: widths.reduce((s, v) => s + v, 0),
      c1: pseudo.c1, c2, seed: Math.floor(r() * 1e9), boomed: false, flash: r() < 0.5 ? pseudo.c1 : 'warm',
    };
    fw.len = Math.hypot(ax - x0, ay - y0) + 1;
    fw.rng = rngFor('finale' + fw.seed);
    fw.parts = buildBurst(fw, pseudo, fw.rng);
    fireworks.push(fw);
  }

  function afterglow(now) {
    if (!after.on) {
      after.on = true;
      after.t0 = now;
      after.next = now + 350;
      after.nextTiny = now + 1200;
      after.rng = rngFor('finale');
      const r = rngFor('motes');
      after.motes = Array.from({ length: 9 }, () => {
        const [x, y] = finaleSpot(r, 30);
        return { x, y, ph: r() * TAU, sp: range(r, 0.15, 0.35), c: pick(r, PASTELS), z: range(r, 1.4, 2.3) };
      });
    }
    const e = (now - after.t0) / 1000;
    let live = 0;
    for (const fw of fireworks) if (fw.after && fw.kind === 'rocket' && !fw.dying) live++;
    // celebratory for ~10 s (up to 4 at once), then a slower, never-empty glow
    const cap = e < 10 ? 4 : 2;
    if (now >= after.next && live < cap) {
      spawnFinale(now);
      after.next = now + 1000 * (e < 10 ? range(after.rng, 0.4, 0.95) : range(after.rng, 1.8, 3.6));
    }
  }

  // a few slow drifting embers
  function drawMotes(now) {
    const e = (now - after.t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fade = clamp(e / 1.5);
    for (const m of after.motes) {
      const x = m.x + (motion ? Math.sin(e * m.sp + m.ph) * 18 : 0);
      const y = m.y + (motion ? Math.cos(e * m.sp * 0.8 + m.ph) * 12 : 0);
      glow(m.c, x, y, m.z * unit * 2.2, 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(e * (0.6 + m.sp) + m.ph * 3)));
    }
  }

  /* ------------------------------------------------------------------
     loop
     ------------------------------------------------------------------ */
  let pS = 0, lastT = 0, rafId = 0, skyDirty = false, cleared = false, shiftStr = '', primed = false;

  function schedule() { if (!rafId) rafId = requestAnimationFrame(frame); }

  function frame(now) {
    rafId = 0;
    const pT = target();
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if (motion) pS += (pT - pS) * (1 - Math.exp(-dt * CONFIG.smoothing));
    else pS = pT;
    if (Math.abs(pT - pS) < 0.0004) pS = pT;
    const p = pS;
    const isClear = p >= CONFIG.clearAt;

    // 1 — launches (reads happen here, before any writes)
    let rockets = 0, smalls = 0;
    for (const fw of fireworks) {
      if (fw.kind === 'rocket' && (now - fw.t0) / 1000 < fw.A + fw.H + fw.life * 0.55) rockets++;
      else if (fw.kind !== 'rocket') smalls++;
    }
    const maxR = CONFIG.maxRockets + (vmin > 700 ? 1 : 0);
    for (const w of words) {
      if (p >= w.L) {
        if (!w.fired) {
          w.fired = true;
          if (!primed || isClear) continue;
          if (w.rocket && rockets < maxR && now - lastRocketAt > 110) { spawn(w, 'rocket', now); rockets++; }
          else if (smalls < 40) { spawn(w, 'spark', now); smalls++; }
        }
      } else w.fired = false;
    }
    primed = true;

    // 2 — writes: the text block
    const shift = shiftMax * clamp(p / 0.8);
    const s = `translate3d(0,${(-shift).toFixed(1)}px,0)`;
    if (s !== shiftStr) { article.style.transform = s; shiftStr = s; }

    const swapDx = new Map();
    if (motion) {
      for (const sp of swapPairs) {
        if (!sp.ok) continue;
        const k = clamp((p - sp.at) / 0.05);
        if (k > 0) { const e = easeOut2(k); swapDx.set(sp.a, sp.dxA * e); swapDx.set(sp.b, sp.dxB * e); }
      }
    }
    for (const w of words) {
      if (p < w.L) updateInText(w, p, swapDx.get(w) || 0);
      else if (!w.s.hide) { w.s.hide = true; w.el.classList.add('hide'); }
    }

    if (isClear !== cleared) {
      cleared = isClear;
      article.classList.toggle('gone', isClear);
      finalEl.classList.toggle('on', isClear);
    }

    // 3 — fireworks (real time)
    if (isClear) {
      for (const fw of fireworks) if (!fw.after && !fw.dying) fw.dying = now; // the show stops abruptly
      afterglow(now);
    } else if (after.on) {
      after.on = false;
      for (const fw of fireworks) if (fw.after && !fw.dying) fw.dying = now;
    }

    if (skyDirty) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); skyDirty = false; }
    if (fireworks.length || after.on) {
      skyDirty = true;
      ctx.globalCompositeOperation = 'lighter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      curFont = '';
      for (let i = fireworks.length - 1; i >= 0; i--) {
        const fw = fireworks[i];
        fade = fw.dying ? 1 - (now - fw.dying) / 300 : 1;
        if (fade <= 0) { fireworks.splice(i, 1); continue; }
        const t = (now - fw.t0) / 1000;
        if (fw.kind !== 'rocket') {
          if (t > fw.life) { fireworks.splice(i, 1); continue; }
          drawSmall(fw, t);
          continue;
        }
        const tau = t - fw.A - fw.H;
        if (tau > fw.life) { fireworks.splice(i, 1); continue; }
        if (tau < 0) { drawRocket(fw, t); continue; }
        if (!fw.boomed) {
          fw.boomed = true;
          const crackle = fw.type === 'chrysanthemum' || fw.type === 'willow' || (fw.R > vmin * 0.26 && fw.rng() < 0.5);
          const size = fw.type === 'starburst' ? 0.5 : clamp(fw.R / (vmin * 0.25), 0.6, 1.4);
          if (!isClear || fw.after) Sound.burst(size, (fw.bx / vw) * 2 - 1, crackle, fw.rng, fw.type === 'willow');
        }
        drawBurst(fw, tau);
      }
      if (after.on) drawMotes(now);
      fade = 1;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (pS !== pT || fireworks.length || after.on) schedule();
  }

  /* ------------------------------------------------------------------
     start
     ------------------------------------------------------------------ */
  measure();
  pS = target();
  schedule();
  window.addEventListener('scroll', schedule, { passive: true });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { measure(); schedule(); }, 120);
  }, { passive: true });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measure(); schedule(); });
  }

  const onMotionChange = () => { motion = !motionQuery.matches; measure(); schedule(); };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
  else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
})();
