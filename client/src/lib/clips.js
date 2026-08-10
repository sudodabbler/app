// Shared helpers for clip math and formatting, used across timeline/preview.

// Output aspect ratios. Keep in sync with server/src/services/render.js ASPECT.
export const ASPECTS = {
  '9:16': { w: 1080, h: 1920, label: '9:16', hint: 'TikTok / Reels' },
  '1:1': { w: 1080, h: 1080, label: '1:1', hint: 'Square' },
  '4:3': { w: 1440, h: 1080, label: '4:3', hint: 'Classic' },
  '16:9': { w: 1920, h: 1080, label: '16:9', hint: 'Landscape' },
};

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function makeClip(media) {
  const isVideo = media.type === 'video';
  return {
    id: uid(),
    mediaId: media.id,
    type: media.type,
    duration: isVideo ? Math.min(media.duration || 3, 5) : 3,
    trimIn: 0,
    trimOut: isVideo ? media.duration ?? null : null,
    speed: 1,
    fit: 'center-crop',
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    transition: { type: 'cut', duration: 0.3 },
    captionBeatIds: [],
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Effective on-screen duration after trim + speed.
export function clipDuration(clip, media) {
  const speed = clamp(clip.speed || 1, 0.5, 2);
  if (!media || media.type === 'image') {
    return clamp(clip.duration || 3, 0.1, 60);
  }
  const trimIn = Math.max(0, clip.trimIn || 0);
  const srcDur = media.duration || trimIn + (clip.duration || 3);
  const trimOut = clip.trimOut != null ? clip.trimOut : srcDur;
  const rawLen = Math.max(0.1, trimOut - trimIn);
  return rawLen / speed;
}

export function totalDuration(clips, mediaById) {
  let total = 0;
  clips.forEach((c, i) => {
    total += clipDuration(c, mediaById.get(c.mediaId));
    const prev = clips[i - 1];
    if (prev?.transition?.type === 'crossfade') {
      total -= Math.min(1, prev.transition.duration || 0.3);
    }
  });
  return Math.max(0, total);
}

export function fmtDuration(sec) {
  if (sec == null || Number.isNaN(sec)) return '—';
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  if (m > 0) return `${m}:${rem.toFixed(0).padStart(2, '0')}`;
  return `${rem.toFixed(1)}s`;
}

export function fmtBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
