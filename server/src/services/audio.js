import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { run } from '../lib/proc.js';
import { ffmpegAvailable, probeMedia } from './media.js';

const WAVEFORM_BUCKETS = 1000;
const WAVEFORM_SAMPLE_RATE = 8000;

/**
 * Compute normalized waveform peaks by decoding to mono 16-bit PCM and
 * bucketing the max absolute amplitude. Returns an array of 0..1 floats,
 * or [] if ffmpeg is unavailable.
 */
export async function computeWaveform(filePath, buckets = WAVEFORM_BUCKETS) {
  if (!(await ffmpegAvailable())) return [];
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(config.ffmpegBin, [
      '-v', 'error',
      '-i', filePath,
      '-ac', '1',
      '-ar', String(WAVEFORM_SAMPLE_RATE),
      '-f', 's16le',
      '-',
    ]);
    child.stdout.on('data', (d) => chunks.push(d));
    child.on('error', () => resolve([]));
    child.on('close', () => {
      try {
        const buf = Buffer.concat(chunks);
        const sampleCount = Math.floor(buf.length / 2);
        if (sampleCount === 0) return resolve([]);
        const per = Math.max(1, Math.floor(sampleCount / buckets));
        const peaks = [];
        for (let b = 0; b < buckets; b++) {
          let max = 0;
          const start = b * per;
          for (let i = 0; i < per; i++) {
            const idx = (start + i) * 2;
            if (idx + 1 >= buf.length) break;
            const v = Math.abs(buf.readInt16LE(idx));
            if (v > max) max = v;
          }
          peaks.push(Number((max / 32768).toFixed(3)));
        }
        resolve(peaks);
      } catch {
        resolve([]);
      }
    });
  });
}

/**
 * Normalize an uploaded audio/video source into a playable AAC (.m4a) track,
 * probe its duration, and compute a waveform. If ffmpeg is missing, the
 * original file is kept as-is and served directly.
 *
 * Returns { filename, duration, peaks }.
 */
export async function ingestAudio(uploadedPath, audioDir) {
  const meta = await probeMedia(uploadedPath);
  const duration = meta.duration;

  if (!(await ffmpegAvailable())) {
    const filename = path.basename(uploadedPath);
    const peaks = [];
    return { filename, duration, peaks };
  }

  const base = path.basename(uploadedPath, path.extname(uploadedPath));
  const outName = `${base}.m4a`;
  const outPath = path.join(audioDir, outName);

  // Extract/transcode the audio track only.
  const res = await run(config.ffmpegBin, [
    '-y',
    '-i', uploadedPath,
    '-vn',
    '-ac', '2',
    '-c:a', 'aac',
    '-b:a', config.output.audioBitrate,
    outPath,
  ]);

  if (res.code !== 0) {
    // Extraction failed (e.g. no audio stream). Keep original, no waveform.
    return { filename: path.basename(uploadedPath), duration, peaks: [] };
  }

  // Original upload no longer needed once we have the normalized track.
  if (path.resolve(outPath) !== path.resolve(uploadedPath)) {
    await fs.rm(uploadedPath, { force: true });
  }

  const finalMeta = await probeMedia(outPath);
  const peaks = await computeWaveform(outPath);
  return { filename: outName, duration: finalMeta.duration ?? duration, peaks };
}
