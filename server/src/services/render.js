import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { nanoid } from 'nanoid';
import { config, paths } from '../config.js';
import { run, runOrThrow } from '../lib/proc.js';
import { queue } from '../lib/queue.js';
import { getProject, updateProject } from '../lib/db.js';
import { ffmpegAvailable, probeMedia } from './media.js';
import { renderUrl } from '../lib/urls.js';

export const RENDER_JOB = 'render';

const { width: W, height: H, fps: FPS } = config.output;

// ---------- small helpers ----------

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r3 = (n) => Number(Number(n).toFixed(3));

// Escape a path for use inside an ffmpeg filter option value.
function filterPath(p) {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
}

// Escape a path for a concat-demuxer list file (single-quoted).
function concatPath(p) {
  return p.replace(/'/g, "'\\''");
}

// Convert a "#rrggbb" hex color to ffmpeg's "0xRRGGBB" form. Falls back to
// white for anything unexpected.
function ffColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  return m ? `0x${m[1].toUpperCase()}` : '0xFFFFFF';
}

// Cache which optional filters this ffmpeg build actually ships. drawtext in
// particular is absent from some static builds; a missing optional filter must
// degrade (skip captions) rather than fail the whole render.
let filterListCache = null;
async function hasFilter(name) {
  if (!filterListCache) {
    try {
      const res = await run(config.ffmpegBin, ['-hide_banner', '-filters']);
      filterListCache = res.stdout || '';
    } catch {
      filterListCache = '';
    }
  }
  return new RegExp(`\\b${name}\\b`).test(filterListCache);
}

let cachedFontArg = null;
function fontArg() {
  if (cachedFontArg) return cachedFontArg;
  const candidates = [
    process.env.CLIPSTITCH_FONT,
    config.captionFont, // bundled Montserrat Bold (TikTok-style)
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial.ttf',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) {
      cachedFontArg = `fontfile='${filterPath(c)}'`;
      return cachedFontArg;
    }
  }
  // Fall back to fontconfig lookup by family name.
  cachedFontArg = 'font=Sans';
  return cachedFontArg;
}

// Naive word-wrap so drawtext lines stay within the frame.
function wrapText(text, maxChars = 22) {
  return text
    .split('\n')
    .map((line) => {
      const words = line.trim().split(/\s+/).filter(Boolean);
      const out = [];
      let cur = '';
      for (const w of words) {
        if (!cur) cur = w;
        else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
        else {
          out.push(cur);
          cur = w;
        }
      }
      if (cur) out.push(cur);
      return out.join('\n');
    })
    .join('\n');
}

function resolveMediaFile(projectId, media) {
  if (!media?.filename) return null;
  return path.join(paths.media(projectId), media.filename);
}

// Effective on-screen duration of a clip after trim + speed.
function clipDuration(clip, media) {
  const speed = clamp(clip.speed || 1, 0.5, 2);
  if (media.type === 'image') {
    return r3(clamp(clip.duration || 3, 0.1, 60));
  }
  const trimIn = Math.max(0, clip.trimIn || 0);
  const srcDur = media.duration || (trimIn + (clip.duration || 3));
  const trimOut = clip.trimOut != null ? clip.trimOut : srcDur;
  const rawLen = Math.max(0.1, trimOut - trimIn);
  return r3(rawLen / speed);
}

// ---------- video filter chain for one clip ----------

function buildVideoFilter(clip, media) {
  const speed = clamp(clip.speed || 1, 0.5, 2);
  const stmts = [];

  if (media.type === 'video' && speed !== 1) {
    stmts.push(`[0:v]setpts=PTS/${speed},format=yuv420p,fps=${FPS}[base]`);
  } else {
    stmts.push(`[0:v]format=yuv420p,fps=${FPS}[base]`);
  }

  const fit = clip.fit || 'center-crop';
  if (fit === 'blur') {
    stmts.push(
      `[base]split=2[bblur][bfg];` +
        `[bblur]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=20[bg];` +
        `[bfg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[fit]`,
    );
  } else if (fit === 'reposition') {
    const S = clamp(clip.scale || 1, 1, 4);
    const offX = Math.round(clip.offsetX || 0);
    const offY = Math.round(clip.offsetY || 0);
    stmts.push(
      `[base]scale=trunc(${W}*${S}/2)*2:trunc(${H}*${S}/2)*2:force_original_aspect_ratio=increase,` +
        `crop=${W}:${H}:(iw-ow)/2+${offX}:(ih-oh)/2+${offY},setsar=1[fit]`,
    );
  } else {
    // center-crop (default)
    stmts.push(
      `[base]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[fit]`,
    );
  }
  return stmts;
}

async function writeCaptionFile(tmpDir, index, text) {
  const file = path.join(tmpDir, `cap_${String(index).padStart(3, '0')}.txt`);
  await fs.writeFile(file, wrapText(text), 'utf8');
  return file;
}

// ---------- per-clip normalized intermediate ----------

async function encodeSegment({ projectId, clip, media, beats, index, tmpDir, originalAudio, canDrawText, captionColor }) {
  const file = resolveMediaFile(projectId, media);
  if (!file || !existsSync(file)) {
    throw new Error(`Media file missing for clip ${index + 1}`);
  }

  const segPath = path.join(tmpDir, `seg_${String(index).padStart(3, '0')}.mp4`);
  const effDur = clipDuration(clip, media);
  const speed = clamp(clip.speed || 1, 0.5, 2);
  const isImage = media.type === 'image';
  const hasRealAudio = !isImage && media.hasAudio && originalAudio !== 'mute';

  const args = ['-y'];

  // Video input.
  if (isImage) {
    args.push('-loop', '1', '-t', String(effDur), '-i', file);
  } else {
    const trimIn = Math.max(0, clip.trimIn || 0);
    const srcDur = media.duration || trimIn + (clip.duration || 3);
    const trimOut = clip.trimOut != null ? clip.trimOut : srcDur;
    const rawLen = Math.max(0.1, trimOut - trimIn);
    args.push('-ss', String(r3(trimIn)), '-t', String(r3(rawLen)), '-i', file);
  }

  // Silent audio source when the clip contributes no audio of its own.
  if (!hasRealAudio) {
    args.push(
      '-f', 'lavfi',
      '-t', String(r3(effDur + 0.2)),
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    );
  }

  // Build the filter graph.
  const vStmts = buildVideoFilter(clip, media);

  // Burned-in captions.
  const burnedBeats = (clip.captionBeatIds || [])
    .map((id) => beats.find((b) => b.id === id))
    .filter((b) => b && b.burn && b.text?.trim());
  let lastVideoLabel = '[fit]';
  if (burnedBeats.length && canDrawText) {
    const text = burnedBeats.map((b) => b.text.trim()).join('\n');
    const capFile = await writeCaptionFile(tmpDir, index, text);
    vStmts.push(
      `[fit]drawtext=${fontArg()}:textfile='${filterPath(capFile)}':fontcolor=${ffColor(captionColor)}:` +
        `fontsize=54:borderw=4:bordercolor=black:line_spacing=10:` +
        `x=(w-text_w)/2:y=h*0.70[vout]`,
    );
    lastVideoLabel = '[vout]';
  } else {
    vStmts.push(`[fit]null[vout]`);
    lastVideoLabel = '[vout]';
  }

  const filterParts = [...vStmts];
  let audioMap;
  if (hasRealAudio) {
    filterParts.push(
      `[0:a]atempo=${speed},aformat=sample_rates=44100:channel_layouts=stereo[aout]`,
    );
    audioMap = '[aout]';
  } else {
    audioMap = '1:a';
  }

  args.push('-filter_complex', filterParts.join(';'));
  args.push('-map', lastVideoLabel, '-map', audioMap);
  args.push(
    '-r', String(FPS),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', config.output.audioBitrate,
    '-ar', '44100',
    '-ac', '2',
    '-t', String(effDur),
    '-video_track_timescale', '30000',
    '-movflags', '+faststart',
    segPath,
  );

  await runOrThrow(config.ffmpegBin, args);
  return { segPath, effDur };
}

// ---------- assemble: concat (cuts) or xfade chain (crossfades) ----------

async function assembleSegments(segments, clips, media, tmpDir) {
  const durations = segments.map((s) => s.effDur);
  const outPath = path.join(tmpDir, 'concat.mp4');

  // Which transitions are crossfades? transition[i] is between clip i and i+1.
  const anyCrossfade = clips
    .slice(0, -1)
    .some((c) => c.transition?.type === 'crossfade');

  if (segments.length === 1) {
    await fs.copyFile(segments[0].segPath, outPath);
    return { outPath, videoDur: durations[0] };
  }

  if (!anyCrossfade) {
    // Fast path: concat demuxer with stream copy.
    const listPath = path.join(tmpDir, 'concat.txt');
    const list = segments
      .map((s) => `file '${concatPath(path.resolve(s.segPath))}'`)
      .join('\n');
    await fs.writeFile(listPath, list, 'utf8');
    await runOrThrow(config.ffmpegBin, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outPath,
    ]);
    const videoDur = r3(durations.reduce((a, b) => a + b, 0));
    return { outPath, videoDur };
  }

  // Crossfade path: linear xfade/acrossfade (or concat) chain over normalized
  // intermediates. Reliable because every input shares size/fps/tb/codec.
  const inputs = [];
  segments.forEach((s) => inputs.push('-i', s.segPath));

  const stmts = [];
  let curV = '[0:v]';
  let curA = '[0:a]';
  let curDur = durations[0];

  for (let i = 1; i < segments.length; i++) {
    const trans = clips[i - 1].transition || {};
    const isXfade = trans.type === 'crossfade';
    const d = isXfade ? clamp(trans.duration || 0.3, 0.1, Math.min(1, durations[i - 1], durations[i]) - 0.01) : 0;

    const vLabel = `[v${i}]`;
    const aLabel = `[a${i}]`;

    if (d > 0) {
      const offset = r3(Math.max(0, curDur - d));
      stmts.push(`${curV}[${i}:v]xfade=transition=fade:duration=${r3(d)}:offset=${offset}${vLabel}`);
      stmts.push(`${curA}[${i}:a]acrossfade=d=${r3(d)}${aLabel}`);
      curDur = r3(curDur + durations[i] - d);
    } else {
      stmts.push(`${curV}[${i}:v]concat=n=2:v=1:a=0${vLabel}`);
      stmts.push(`${curA}[${i}:a]concat=n=2:v=0:a=1${aLabel}`);
      curDur = r3(curDur + durations[i]);
    }
    curV = vLabel;
    curA = aLabel;
  }

  await runOrThrow(config.ffmpegBin, [
    '-y',
    ...inputs,
    '-filter_complex', stmts.join(';'),
    '-map', curV,
    '-map', curA,
    '-r', String(FPS),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', config.output.audioBitrate,
    '-ar', '44100',
    '-ac', '2',
    '-movflags', '+faststart',
    outPath,
  ]);

  return { outPath, videoDur: curDur };
}

// ---------- final audio mix ----------

async function mixAudio({ concatPath: videoPath, videoDur, selection, tracks, originalAudio, tmpDir }) {
  const outPath = path.join(tmpDir, 'final.mp4');

  const track = selection ? tracks.find((t) => t.id === selection.audioId) : null;
  const clipGain = originalAudio === 'duck' ? 0.2 : originalAudio === 'mute' ? 0 : 1;

  // No music selected → keep clip audio (or strip it if muted).
  if (!track) {
    if (originalAudio === 'mute') {
      await runOrThrow(config.ffmpegBin, [
        '-y', '-i', videoPath, '-map', '0:v', '-c:v', 'copy', '-an',
        '-movflags', '+faststart', outPath,
      ]);
    } else {
      await fs.copyFile(videoPath, outPath);
    }
    return { outPath, finalDur: videoDur };
  }

  const musicFile = path.join(paths.audio(selection.projectId), track.filename);
  if (!existsSync(musicFile)) {
    // Music file vanished — fall back to clip audio only.
    await fs.copyFile(videoPath, outPath);
    return { outPath, finalDur: videoDur };
  }

  const snipIn = Math.max(0, selection.in || 0);
  const snipOut = selection.out != null ? selection.out : track.duration || snipIn + videoDur;
  const snipDur = r3(Math.max(0.1, snipOut - snipIn));
  const volume = clamp(selection.volume ?? 1, 0, 2);
  const fadeIn = Math.max(0, selection.fadeIn || 0);
  const fadeOut = Math.max(0, selection.fadeOut || 0);
  const loop = !!selection.loop;
  const trimToAudio = selection.trimToAudio !== false; // default true

  // 1) Extract the snippet to its own file so looping repeats only the snippet.
  const snipPath = path.join(tmpDir, 'snippet.m4a');
  await runOrThrow(config.ffmpegBin, [
    '-y', '-ss', String(r3(snipIn)), '-t', String(snipDur), '-i', musicFile,
    '-vn', '-c:a', 'aac', '-b:a', config.output.audioBitrate, '-ar', '44100', '-ac', '2',
    snipPath,
  ]);

  // 2) Decide final duration + music fade timing.
  let finalDur;
  if (loop) {
    finalDur = videoDur;
  } else if (trimToAudio) {
    finalDur = r3(Math.min(videoDur, snipDur));
  } else {
    finalDur = videoDur;
  }
  const musicEnd = loop ? finalDur : Math.min(snipDur, finalDur);
  const fadeOutStart = r3(Math.max(0, musicEnd - fadeOut));

  const musicChain =
    `volume=${volume},` +
    (fadeIn > 0 ? `afade=t=in:st=0:d=${r3(fadeIn)},` : '') +
    (fadeOut > 0 ? `afade=t=out:st=${fadeOutStart}:d=${r3(fadeOut)},` : '') +
    `aformat=sample_rates=44100:channel_layouts=stereo`;

  const inputArgs = ['-i', videoPath];
  if (loop) inputArgs.push('-stream_loop', '-1');
  inputArgs.push('-i', snipPath);

  const filter =
    `[0:a]volume=${clipGain},aformat=sample_rates=44100:channel_layouts=stereo[ca];` +
    `[1:a]${musicChain}[ma];` +
    `[ca][ma]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`;

  await runOrThrow(config.ffmpegBin, [
    '-y',
    ...inputArgs,
    '-filter_complex', filter,
    '-map', '0:v', '-c:v', 'copy',
    '-map', '[mix]', '-c:a', 'aac', '-b:a', config.output.audioBitrate,
    '-t', String(finalDur),
    '-movflags', '+faststart',
    outPath,
  ]);

  return { outPath, finalDur };
}

// ---------- render history housekeeping ----------

async function pruneRenders(projectId, project) {
  const keep = config.maxRendersKept;
  if (project.renders.length <= keep) return project.renders;
  const toRemove = project.renders.slice(keep);
  for (const r of toRemove) {
    if (r.filename) {
      await fs.rm(path.join(paths.renders(projectId), r.filename), { force: true });
    }
  }
  return project.renders.slice(0, keep);
}

// ---------- job handler ----------

async function handleRender({ projectId, options }, ctx) {
  if (!(await ffmpegAvailable())) {
    throw new Error('ffmpeg is not installed on the server. Renders require ffmpeg.');
  }

  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found');

  const clips = project.timeline.clips || [];
  if (clips.length === 0) throw new Error('Timeline is empty — add clips before rendering.');

  const mediaById = new Map(project.media.map((m) => [m.id, m]));
  const beats = project.script?.beats || [];
  const captionColor = project.script?.captionStyle?.color || '#ffffff';
  const selection = project.audio?.selection
    ? { ...project.audio.selection, projectId }
    : null;
  const originalAudio = selection?.originalAudio || 'keep';

  // Fresh scratch dir for this render.
  const tmpDir = path.join(paths.tmp(projectId), `render_${nanoid(6)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  // drawtext is optional in some ffmpeg builds — detect once and warn if a
  // captioned render can't burn captions rather than failing outright.
  const canDrawText = await hasFilter('drawtext');
  const wantsCaptions = clips.some((c) =>
    (c.captionBeatIds || []).some((id) => beats.find((b) => b.id === id)?.burn),
  );
  const warnings = [];
  if (wantsCaptions && !canDrawText) {
    warnings.push('captions skipped: this ffmpeg build has no drawtext filter');
  }

  try {
    // 1) Per-clip intermediates.
    const usableClips = [];
    const segments = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const media = mediaById.get(clip.mediaId);
      if (!media || media.status === 'failed' || !media.filename) continue;
      ctx.setProgress(5 + (i / clips.length) * 60, `Rendering clip ${i + 1}/${clips.length}`);
      const seg = await encodeSegment({
        projectId,
        clip,
        media,
        beats,
        index: usableClips.length,
        tmpDir,
        originalAudio,
        canDrawText,
        captionColor,
      });
      segments.push(seg);
      usableClips.push(clip);
    }

    if (segments.length === 0) {
      throw new Error('No usable clips (media may be missing or failed).');
    }

    // 2) Assemble.
    ctx.setProgress(70, 'Stitching clips');
    const { outPath: concatOut, videoDur } = await assembleSegments(
      segments,
      usableClips,
      mediaById,
      tmpDir,
    );

    // 3) Mix audio.
    ctx.setProgress(85, 'Mixing audio');
    const { outPath: finalOut, finalDur } = await mixAudio({
      concatPath: concatOut,
      videoDur,
      selection,
      tracks: project.audio?.tracks || [],
      originalAudio,
      tmpDir,
    });

    // 4) Publish to renders dir.
    ctx.setProgress(95, 'Finalizing');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `render_${stamp}.mp4`;
    const dest = path.join(paths.renders(projectId), filename);
    await fs.mkdir(paths.renders(projectId), { recursive: true });
    await fs.rename(finalOut, dest).catch(async () => {
      await fs.copyFile(finalOut, dest);
    });

    const probe = await probeMedia(dest);
    let sizeBytes = null;
    try {
      sizeBytes = (await fs.stat(dest)).size;
    } catch {}

    const record = {
      id: nanoid(10),
      filename,
      url: renderUrl(projectId, filename),
      createdAt: new Date().toISOString(),
      duration: probe.duration ?? finalDur,
      width: probe.width ?? W,
      height: probe.height ?? H,
      sizeBytes,
      clipCount: segments.length,
      warnings,
    };

    await updateProject(projectId, async (p) => {
      p.renders.unshift(record);
      p.renders = await pruneRenders(projectId, p);
    });

    return record;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export function registerRenderWorker() {
  queue.register(RENDER_JOB, handleRender);
}
