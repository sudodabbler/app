const TRACKS = [
  { title: 'YES',              time: '2:52' },
  { title: 'ICON',             time: '2:52' },
  { title: 'GET U',            time: '3:03' },
  { title: 'KISS',             time: '2:55' },
  { title: 'WAITING',          time: '3:01' },
  { title: 'VAIN',             time: '5:55' },
  { title: 'ALWAYS',           time: '3:53' },
  { title: 'FOR YOU, I WOULD', time: '4:18' }
];

const arena = document.getElementById('arena');
const hint = document.getElementById('hint');
const drawnCountEl = document.getElementById('drawnCount');
const escapeHint = document.getElementById('escapeHint');
const soundToggle = document.getElementById('soundToggle');

let focusedIndex = null;
let drawn = new Set();
let finaleStarted = false;

/* ---------------- sword svg ---------------- */

// engraved text shrinks to fit the blade width
function engraveSize(title) {
  const n = title.length;
  if (n <= 4) return 30;
  if (n <= 7) return 27;
  if (n <= 10) return 24;
  return 19;
}

const BLADE = 'M60,136 L100,136 L98,528 L80,602 L62,528 Z';

function swordSVG(i, track) {
  const fs = engraveSize(track.title);
  return `
<svg viewBox="0 0 160 620" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="blade${i}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#556774"/>
      <stop offset="9%"   stop-color="#93a5b1"/>
      <stop offset="23%"  stop-color="#ccd9e1"/>
      <stop offset="39%"  stop-color="#9dafbb"/>
      <stop offset="50%"  stop-color="#7f919e"/>
      <stop offset="61%"  stop-color="#9dafbb"/>
      <stop offset="77%"  stop-color="#c8d5dd"/>
      <stop offset="91%"  stop-color="#8b9da9"/>
      <stop offset="100%" stop-color="#50626f"/>
    </linearGradient>
    <linearGradient id="fuller${i}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#63757f"/>
      <stop offset="45%"  stop-color="#8598a4"/>
      <stop offset="100%" stop-color="#63757f"/>
    </linearGradient>
    <linearGradient id="guard${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#8d8471"/>
      <stop offset="30%"  stop-color="#5c5544"/>
      <stop offset="65%"  stop-color="#3a352a"/>
      <stop offset="100%" stop-color="#1c1a14"/>
    </linearGradient>
    <linearGradient id="grip${i}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#15100c"/>
      <stop offset="32%"  stop-color="#3b2d22"/>
      <stop offset="62%"  stop-color="#2a2019"/>
      <stop offset="100%" stop-color="#120d09"/>
    </linearGradient>
    <linearGradient id="scab${i}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#0d0b09"/>
      <stop offset="20%"  stop-color="#2a2319"/>
      <stop offset="48%"  stop-color="#3b3125"/>
      <stop offset="76%"  stop-color="#221c15"/>
      <stop offset="100%" stop-color="#0a0806"/>
    </linearGradient>
    <linearGradient id="glint${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="45%"  stop-color="#ffffff" stop-opacity=".9"/>
      <stop offset="55%"  stop-color="#ffffff" stop-opacity=".9"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="bladeClip${i}"><path d="${BLADE}"/></clipPath>
  </defs>

  <!-- ===== blade ===== -->
  <g class="blade">
    <path d="${BLADE}" fill="url(#blade${i})"/>
    <path d="M76,152 L84,152 L83.5,500 L76.5,500 Z" fill="url(#fuller${i})" opacity=".5"/>
    <path d="M60,136 L62.5,136 L64.5,528 L62,528 Z" fill="#ffffff" opacity=".28"/>
    <path d="M97.5,136 L100,136 L98,528 L95.5,528 Z" fill="#ffffff" opacity=".18"/>

    <!-- engraving: lit lower lip + dark incision -->
    <g class="engraving">
      <g transform="translate(80,292) rotate(90)">
        <text x="0" y="1.8" text-anchor="middle" dominant-baseline="central"
              font-family="Times New Roman, Times, serif"
              font-size="${fs}" letter-spacing="2.6" fill="#f4fafd" opacity=".55">${track.title}</text>
        <text x="0" y="0" text-anchor="middle" dominant-baseline="central"
              font-family="Times New Roman, Times, serif"
              font-size="${fs}" letter-spacing="2.6" fill="#28394a" opacity=".95">${track.title}</text>
      </g>
      <g transform="translate(80,440) rotate(90)">
        <text x="0" y="1.5" text-anchor="middle" dominant-baseline="central"
              font-family="Times New Roman, Times, serif"
              font-size="19" letter-spacing="2" fill="#f4fafd" opacity=".5">${track.time}</text>
        <text x="0" y="0" text-anchor="middle" dominant-baseline="central"
              font-family="Times New Roman, Times, serif"
              font-size="19" letter-spacing="2" fill="#28394a" opacity=".88">${track.time}</text>
      </g>
    </g>

    <g clip-path="url(#bladeClip${i})">
      <rect class="glint-band" x="52" y="240" width="56" height="150" fill="url(#glint${i})"/>
    </g>
  </g>

  <!-- ===== hilt ===== -->
  <g class="hilt">
    <path d="M22,118 Q14,127 22,137 L138,137 Q146,127 138,118 Z" fill="url(#guard${i})"/>
    <rect x="66" y="112" width="28" height="30" rx="3" fill="url(#guard${i})"/>
    <rect x="69" y="48" width="22" height="70" rx="7" fill="url(#grip${i})"/>
    <g stroke="#080604" stroke-width="1.3" opacity=".55">
      <line x1="69" y1="59" x2="91" y2="61"/>
      <line x1="69" y1="70" x2="91" y2="72"/>
      <line x1="69" y1="81" x2="91" y2="83"/>
      <line x1="69" y1="92" x2="91" y2="94"/>
      <line x1="69" y1="103" x2="91" y2="105"/>
    </g>
    <circle cx="80" cy="38" r="17" fill="url(#guard${i})"/>
    <circle cx="80" cy="38" r="7.5" fill="#1d1a13" opacity=".7"/>
    <circle cx="75" cy="32" r="4" fill="#fff" opacity=".3"/>
  </g>

  <!-- ===== scabbard ===== -->
  <g class="scabbard">
    <path d="M55,130 L105,130 L101,556 L86,612 Q80,622 74,612 L59,556 Z" fill="url(#scab${i})"/>
    <path d="M57,532 L103,532 L101,556 L86,612 Q80,622 74,612 L59,556 Z" fill="url(#guard${i})" opacity=".95"/>
    <rect x="53" y="124" width="54" height="24" rx="3" fill="url(#guard${i})"/>
    <rect x="56" y="222" width="48" height="16" fill="#514734" opacity=".5"/>
    <rect x="56" y="360" width="48" height="16" fill="#514734" opacity=".5"/>
    <g stroke="#060504" stroke-width="1.4" opacity=".5" stroke-dasharray="5 6">
      <line x1="80" y1="150" x2="80" y2="524"/>
    </g>
    <path d="M55,130 L61,130 L64,534 L59,534 Z" fill="#fff" opacity=".08"/>
  </g>
</svg>`;
}

/* ---------------- build ---------------- */

TRACKS.forEach((track, i) => {
  const el = document.createElement('div');
  el.className = 'sword';
  el.dataset.index = i;
  el.style.setProperty('--slot', (i * 45) + 'deg');
  el.style.setProperty('--bob-dur', (6.4 + (i % 4) * 0.7) + 's');
  el.style.setProperty('--bob-delay', (-i * 0.9) + 's');
  el.innerHTML = `<div class="sword-bob">${swordSVG(i, track)}</div>`;
  el.addEventListener('click', (e) => { e.stopPropagation(); onSwordClick(i); });
  arena.appendChild(el);
});

const swords = Array.from(document.querySelectorAll('.sword'));

/* ---------------- layout ---------------- */

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // gapY must exceed the drawn sword height (620 * scale) or rows collide
  let cols, scale, gapX, gapY;
  if (w >= 1180)      { cols = 8; scale = 0.68; gapX = Math.min(158, (w - 90) / 8); gapY = 0; }
  else if (w >= 860)  { cols = 4; scale = 0.46; gapX = 168; gapY = 300; }
  else if (w >= 560)  { cols = 4; scale = 0.36; gapX = 130; gapY = 235; }
  else                { cols = 4; scale = 0.29; gapX = 86;  gapY = 195; }

  const rows = Math.ceil(8 / cols);

  swords.forEach((el, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const tx = (col - (cols - 1) / 2) * gapX;
    // gentle arc across the row
    const arc = cols > 1 ? Math.cos(((col / (cols - 1)) - 0.5) * Math.PI) * 26 : 0;
    const ty = (row - (rows - 1) / 2) * gapY - arc + 34;
    const rot = (col - (cols - 1) / 2) * 1.9;

    el.style.setProperty('--tx', tx.toFixed(1) + 'px');
    el.style.setProperty('--ty', ty.toFixed(1) + 'px');
    el.style.setProperty('--rot', rot.toFixed(2) + 'deg');
    el.style.setProperty('--sc', scale);
  });

  // zoom shows roughly 430 sword-units: crossguard down to lower blade
  const focusSc = Math.min(Math.max(h / 430, 1.4), 2.5);
  // frame the engraved span (sword centre is y=310, engravings sit 292–436)
  const focusTy = (310 - 330) * focusSc;
  document.body.style.setProperty('--focus-sc', focusSc.toFixed(3));
  document.body.style.setProperty('--focus-ty', focusTy.toFixed(1) + 'px');

  // halo must fit the viewport: hilts reach R + 283*sc from centre
  const m = Math.min(w, h);
  const haloR = m * 0.255;
  const haloSc = Math.max(m / 1580, 0.22);
  swords.forEach(el => {
    el.style.setProperty('--halo-r', haloR.toFixed(1) + 'px');
    el.style.setProperty('--halo-sc', haloSc.toFixed(3));
  });
}
layout();
window.addEventListener('resize', layout);

/* ---------------- sound ---------------- */

let audioCtx = null;
let soundOn = false;

soundToggle.addEventListener('click', () => {
  soundOn = !soundOn;
  soundToggle.setAttribute('aria-pressed', String(soundOn));
  if (soundOn && !audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (soundOn && audioCtx.state === 'suspended') audioCtx.resume();
});

// synthesised steel ring — no audio file needed
function playRing() {
  if (!soundOn || !audioCtx) return;
  const t = audioCtx.currentTime;

  // noise burst (the scrape)
  const len = Math.floor(audioCtx.sampleRate * 0.5);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buf;
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1400, t);
  bp.frequency.exponentialRampToValueAtTime(5200, t + 0.34);
  bp.Q.value = 1.6;
  const ng = audioCtx.createGain();
  ng.gain.setValueAtTime(0.16, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  noise.connect(bp).connect(ng).connect(audioCtx.destination);
  noise.start(t);

  // metallic partials (the ring)
  [2093, 3135, 4186].forEach((f, k) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.01), t);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 / (k + 1), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.5 - k * 0.3);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 1.6);
  });
}

/* ---------------- interaction ---------------- */

function onSwordClick(i) {
  if (finaleStarted) return;
  const el = swords[i];

  if (focusedIndex === i) { unfocus(); return; }

  if (!drawn.has(i)) {
    drawn.add(i);
    el.classList.add('drawn', 'glinting');
    playRing();
    drawnCountEl.textContent = String(drawn.size);
    setTimeout(() => el.classList.remove('glinting'), 1400);
    if (hint && drawn.size === 1) hint.textContent = 'draw them all';
  }

  focus(i);

  if (drawn.size === TRACKS.length && !finaleStarted) {
    finaleStarted = true;
    setTimeout(startFinale, 2600);
  }
}

function focus(i) {
  swords.forEach(s => s.classList.remove('focused'));
  swords[i].classList.add('focused');
  focusedIndex = i;
  document.body.classList.add('focused');
}

function unfocus() {
  if (focusedIndex === null) return;
  swords.forEach(s => s.classList.remove('focused'));
  focusedIndex = null;
  document.body.classList.remove('focused');
}

escapeHint.addEventListener('click', (e) => { e.stopPropagation(); unfocus(); });
document.addEventListener('click', () => { if (!finaleStarted) unfocus(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') unfocus();
});

/* ---------------- finale ---------------- */

function startFinale() {
  unfocus();
  document.body.classList.add('finale');
  setTimeout(() => arena.classList.add('spinning'), 1900);
  setTimeout(() => document.body.classList.add('finale-ready'), 3000);
}

/* ---------------- console easter egg ---------------- */
console.log(
  '%cfor you, i would',
  'font-family:Times New Roman,serif;font-size:19px;letter-spacing:.32em;color:#cfdae2'
);
console.log(
  '%cspare me, the choice was always yours.',
  'font-family:Times New Roman,serif;font-style:italic;color:#8ba3b5'
);
