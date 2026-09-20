// custom cursor
const cursor = document.getElementById('cursor');
if (cursor) {
  window.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
  });
  document.querySelectorAll('a, button, .track, .gallery-grid img').forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('hovering'));
  });
}

// scroll reveal
const revealTargets = document.querySelectorAll('.track, .vow-text, .vow-sub');
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('in-view');
  });
}, { threshold: 0.2 });
revealTargets.forEach(t => io.observe(t));

// tracklist open/close + audio preview
let currentAudio = null;
let currentBtn = null;

document.querySelectorAll('.track').forEach(track => {
  const row = track.querySelector('.track-row');
  const btn = track.querySelector('.play-btn');
  const audio = track.querySelector('.track-audio');

  row.addEventListener('click', () => {
    track.classList.toggle('open');
  });

  if (btn && audio) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentAudio && currentAudio !== audio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        if (currentBtn) currentBtn.classList.remove('playing');
      }
      if (audio.paused) {
        const start = parseFloat(audio.dataset.start || '0');
        audio.currentTime = start;
        audio.play().catch(() => {});
        btn.classList.add('playing');
        currentAudio = audio;
        currentBtn = btn;
      } else {
        audio.pause();
        btn.classList.remove('playing');
      }
    });
    audio.addEventListener('ended', () => btn.classList.remove('playing'));
  }
});

// the surrender: hold flag to reveal secret
const holdRing = document.getElementById('holdRing');
const holdFill = document.getElementById('holdFill');
const flagRig = document.getElementById('flagRig');
const flagVideo = document.getElementById('flagVideo');
const secret = document.getElementById('secret');

const HOLD_MS = 1800;
let holdTimer = null;
let holdStart = null;
let holdRAF = null;

function startHold() {
  if (secret.classList.contains('revealed')) return;
  holdStart = performance.now();
  flagRig.classList.add('playing');
  flagVideo.play().catch(() => {});

  function step(now) {
    const elapsed = now - holdStart;
    const pct = Math.min(elapsed / HOLD_MS, 1);
    holdFill.style.background = `conic-gradient(var(--ink) ${pct * 360}deg, transparent 0deg)`;
    if (pct < 1) {
      holdRAF = requestAnimationFrame(step);
    } else {
      revealSecret();
    }
  }
  holdRAF = requestAnimationFrame(step);
}

function cancelHold() {
  if (holdRAF) cancelAnimationFrame(holdRAF);
  if (!secret.classList.contains('revealed')) {
    holdFill.style.background = 'conic-gradient(var(--ink) 0deg, transparent 0deg)';
    flagRig.classList.remove('playing');
    flagVideo.pause();
  }
}

function revealSecret() {
  secret.classList.add('revealed');
  holdFill.style.background = 'conic-gradient(var(--ink) 360deg, transparent 0deg)';
  secret.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

if (holdRing) {
  holdRing.addEventListener('mousedown', startHold);
  holdRing.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(); }, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evt => {
    holdRing.addEventListener(evt, cancelHold);
  });
}

// presave button placeholder
const presaveBtn = document.getElementById('presaveBtn');
if (presaveBtn) {
  presaveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    presaveBtn.textContent = 'presave — links loading';
  });
}
