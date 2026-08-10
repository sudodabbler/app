import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { run, isAvailable } from '../lib/proc.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v', '.avi']);

export function classifyByExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  return null;
}

export async function ffmpegAvailable() {
  return isAvailable(config.ffmpegBin);
}
export async function ffprobeAvailable() {
  return isAvailable(config.ffprobeBin);
}

/**
 * Probe a media file for dimensions and (for video) duration.
 * Degrades gracefully: if ffprobe is missing or fails, returns nulls so
 * upload/import still succeeds — the UI just won't show metadata.
 */
export async function probeMedia(filePath) {
  const out = { width: null, height: null, duration: null, hasAudio: false };
  if (!(await ffprobeAvailable())) return out;
  try {
    const res = await run(config.ffprobeBin, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath,
    ]);
    if (res.code !== 0) return out;
    const data = JSON.parse(res.stdout || '{}');
    const streams = data.streams || [];
    const v = streams.find((s) => s.codec_type === 'video');
    const a = streams.find((s) => s.codec_type === 'audio');
    if (v) {
      out.width = v.width ?? null;
      out.height = v.height ?? null;
    }
    out.hasAudio = Boolean(a);
    const dur = data.format?.duration ?? v?.duration;
    if (dur != null && !Number.isNaN(Number(dur))) {
      out.duration = Number(Number(dur).toFixed(3));
    }
  } catch {
    // ignore — return best-effort nulls
  }
  return out;
}

/**
 * Generate a thumbnail for a media item into `thumbDir`.
 * Images: a downscaled JPEG. Videos: a frame near the start.
 * Returns the thumbnail filename, or null if it couldn't be produced.
 */
export async function generateThumbnail(filePath, type, thumbDir, baseName) {
  if (!(await ffmpegAvailable())) return null;
  await fs.mkdir(thumbDir, { recursive: true });
  const thumbName = `${baseName}.jpg`;
  const thumbPath = path.join(thumbDir, thumbName);
  const scale = "scale='min(480,iw)':-2";

  let args;
  if (type === 'video') {
    args = [
      '-y',
      '-ss', '0.5',
      '-i', filePath,
      '-frames:v', '1',
      '-vf', scale,
      thumbPath,
    ];
  } else {
    args = ['-y', '-i', filePath, '-frames:v', '1', '-vf', scale, thumbPath];
  }

  try {
    const res = await run(config.ffmpegBin, args);
    if (res.code !== 0) return null;
    await fs.access(thumbPath);
    return thumbName;
  } catch {
    return null;
  }
}
