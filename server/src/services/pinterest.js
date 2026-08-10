import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { config, paths } from '../config.js';
import { run } from '../lib/proc.js';
import { queue } from '../lib/queue.js';
import { updateProject, ensureProjectDirs } from '../lib/db.js';
import { classifyByExt } from '../services/media.js';
import { buildMediaItem } from '../routes/media.js';

export const PINTEREST_JOB = 'pinterest-fetch';

/**
 * Resolve how to invoke gallery-dl. Prefers the standalone binary, but falls
 * back to `python -m gallery_dl` — which is how it's reachable when installed
 * via pip on systems where Python's Scripts dir isn't on PATH (very common on
 * Windows, including the Microsoft Store Python). Result is cached per process;
 * restart the server after installing gallery-dl for it to be picked up.
 *
 * Returns { bin, pre: string[] } or null if nothing works.
 */
let cachedCmd; // undefined = unresolved, null = none found, object = found
async function resolveGalleryDl() {
  if (cachedCmd !== undefined) return cachedCmd;

  const candidates = [];
  if (process.env.GALLERY_DL_BIN) candidates.push({ bin: process.env.GALLERY_DL_BIN, pre: [], needZero: false });
  candidates.push({ bin: config.galleryDlBin, pre: [], needZero: false }); // 'gallery-dl' on PATH
  for (const py of ['python', 'python3', 'py']) {
    candidates.push({ bin: py, pre: ['-m', 'gallery_dl'], needZero: true });
  }

  for (const c of candidates) {
    try {
      const res = await run(c.bin, [...c.pre, '--version']);
      // A bare binary that spawns is good enough; a `python -m` fallback must
      // exit 0 (non-zero means the module isn't installed for that interpreter).
      if (!c.needZero || res.code === 0) {
        cachedCmd = { bin: c.bin, pre: c.pre };
        return cachedCmd;
      }
    } catch {
      // not spawnable — try the next candidate
    }
  }
  cachedCmd = null;
  return null;
}

export async function galleryDlAvailable() {
  return (await resolveGalleryDl()) !== null;
}

// Recursively collect media files (skip gallery-dl metadata sidecars).
async function collectFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await collectFiles(full)));
    } else if (classifyByExt(e.name)) {
      out.push(full);
    }
  }
  return out;
}

// Best-effort: read a gallery-dl metadata sidecar next to a file for a source URL.
async function readSidecarUrl(mediaFile) {
  const sidecar = `${mediaFile}.json`;
  try {
    const raw = await fs.readFile(sidecar, 'utf8');
    const data = JSON.parse(raw);
    return (
      data.webpage_url ||
      data.url ||
      data.link ||
      data.pin_url ||
      (data.pin_id ? `https://www.pinterest.com/pin/${data.pin_id}/` : null) ||
      null
    );
  } catch {
    return null;
  }
}

async function moveInto(srcFile, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const ext = path.extname(srcFile).toLowerCase();
  const base = path
    .basename(srcFile, ext)
    .replace(/[^a-z0-9._-]+/gi, '_')
    .slice(0, 50);
  const destName = `${Date.now()}_${nanoid(6)}_${base}${ext}`;
  const destPath = path.join(destDir, destName);
  try {
    await fs.rename(srcFile, destPath);
  } catch {
    await fs.copyFile(srcFile, destPath);
    await fs.rm(srcFile, { force: true });
  }
  return destName;
}

/**
 * Fetch media for one URL into a scratch dir. Returns
 * { status, files: string[], error }.
 */
async function fetchUrl(url, scratchDir, remainingBudget, cmd) {
  await fs.mkdir(scratchDir, { recursive: true });
  const range = `1-${Math.max(1, remainingBudget)}`;
  const res = await run(cmd.bin, [
    ...cmd.pre,
    '--dest', scratchDir,
    '--range', range,
    '--write-metadata',
    '--no-mtime',
    url,
  ]);

  const files = await collectFiles(scratchDir);

  if (res.code !== 0 && files.length === 0) {
    const tail = (res.stderr || '').split('\n').filter(Boolean).slice(-4).join(' ');
    return { status: 'failed', files: [], error: tail || `gallery-dl exited ${res.code}` };
  }
  return { status: 'fetched', files, error: null };
}

/**
 * Queue worker. Payload: { projectId, urls: string[] }.
 * Imports fetched media into the project library, records per-URL results,
 * and appends a `failed` placeholder media item for URLs that returned nothing.
 */
async function handleFetch({ projectId, urls }, ctx) {
  const cmd = await resolveGalleryDl();
  if (!cmd) {
    throw new Error(
      'gallery-dl is not installed on the server. Install it (pip install gallery-dl) or use direct file upload.',
    );
  }

  await ensureProjectDirs(projectId);
  const scratchRoot = path.join(paths.tmp(projectId), `pin_${nanoid(6)}`);
  await fs.mkdir(scratchRoot, { recursive: true });

  const results = [];
  const newItems = [];
  let budget = config.maxPinterestItems;

  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i].trim();
      if (!url) continue;
      ctx.setProgress(((i + 0.1) / urls.length) * 90, `Fetching ${url}`);

      if (budget <= 0) {
        results.push({ url, status: 'skipped', count: 0, error: 'Item cap reached' });
        continue;
      }

      const scratchDir = path.join(scratchRoot, `u${i}`);
      let outcome;
      try {
        outcome = await fetchUrl(url, scratchDir, budget, cmd);
      } catch (err) {
        outcome = { status: 'failed', files: [], error: err.message };
      }

      if (outcome.status === 'failed') {
        results.push({ url, status: 'failed', count: 0, error: outcome.error });
        newItems.push({
          id: nanoid(10),
          type: 'image',
          filename: null,
          url: null,
          thumbnail: null,
          width: null,
          height: null,
          duration: null,
          hasAudio: false,
          source: 'pinterest',
          sourceUrl: url,
          board: url,
          status: 'failed',
          error: outcome.error,
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      let count = 0;
      for (const file of outcome.files) {
        if (budget <= 0) break;
        const sourceUrl = (await readSidecarUrl(file)) || url;
        const destName = await moveInto(file, paths.media(projectId));
        const item = await buildMediaItem(projectId, destName, {
          source: 'pinterest',
          sourceUrl,
          board: url,
        });
        newItems.push(item);
        count += 1;
        budget -= 1;
        ctx.setProgress(
          ((i + 0.1) / urls.length) * 90 + (count / Math.max(outcome.files.length, 1)) * (90 / urls.length),
          `Imported ${count} from ${url}`,
        );
      }
      results.push({ url, status: count > 0 ? 'fetched' : 'failed', count, error: count ? null : 'No media found' });
    }

    ctx.setProgress(95, 'Saving to library');
    await updateProject(projectId, (p) => {
      p.media.push(...newItems);
    });

    return { results, imported: newItems.length };
  } finally {
    await fs.rm(scratchRoot, { recursive: true, force: true });
  }
}

export function registerPinterestWorker() {
  queue.register(PINTEREST_JOB, handleFetch);
}
