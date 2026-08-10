import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { paths } from '../config.js';
import { getProject, updateProject, ensureProjectDirs } from '../lib/db.js';
import { classifyByExt, probeMedia, generateThumbnail } from '../services/media.js';
import { mediaUrl, thumbUrl } from '../lib/urls.js';

const router = Router();

// Store uploads directly into the project's media dir with a safe name.
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        await ensureProjectDirs(req.params.id);
        cb(null, paths.media(req.params.id));
      } catch (err) {
        cb(err);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      const base = path
        .basename(file.originalname, ext)
        .replace(/[^a-z0-9._-]+/gi, '_')
        .slice(0, 60);
      cb(null, `${Date.now()}_${nanoid(6)}_${base}${ext.toLowerCase()}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per file
});

/**
 * Build a MediaItem record for a file already sitting in the media dir.
 * Probes metadata and generates a thumbnail (best-effort).
 */
export async function buildMediaItem(projectId, filename, extra = {}) {
  const filePath = path.join(paths.media(projectId), filename);
  const type = classifyByExt(filename) || 'image';
  const meta = await probeMedia(filePath);
  const baseName = path.basename(filename, path.extname(filename));
  const thumb = await generateThumbnail(filePath, type, paths.thumbs(projectId), baseName);

  return {
    id: nanoid(10),
    type,
    filename,
    url: mediaUrl(projectId, filename),
    thumbnail: thumbUrl(projectId, thumb),
    width: meta.width,
    height: meta.height,
    duration: meta.duration,
    hasAudio: meta.hasAudio,
    source: 'upload',
    sourceUrl: null,
    board: null,
    status: 'fetched',
    error: null,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

// GET /api/projects/:id/media
router.get('/:id/media', async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project.media);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/media/upload  (multipart, field "files")
router.post('/:id/media/upload', upload.array('files', 50), async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const files = req.files || [];
    const items = [];
    for (const f of files) {
      if (!classifyByExt(f.filename)) {
        // Unsupported type — drop the file from disk and skip.
        await fs.rm(path.join(paths.media(req.params.id), f.filename), { force: true });
        continue;
      }
      items.push(await buildMediaItem(req.params.id, f.filename));
    }

    await updateProject(req.params.id, (p) => {
      p.media.push(...items);
    });

    res.status(201).json(items);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id/media/:mediaId
router.delete('/:id/media/:mediaId', async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const item = project.media.find((m) => m.id === req.params.mediaId);
    if (!item) return res.status(404).json({ error: 'Media not found' });

    // Remove file + thumbnail from disk.
    if (item.filename) {
      await fs.rm(path.join(paths.media(req.params.id), item.filename), { force: true });
    }
    if (item.thumbnail) {
      const thumbName = path.basename(item.thumbnail);
      await fs.rm(path.join(paths.thumbs(req.params.id), thumbName), { force: true });
    }

    await updateProject(req.params.id, (p) => {
      p.media = p.media.filter((m) => m.id !== req.params.mediaId);
      // Also drop any timeline clips that referenced it.
      p.timeline.clips = p.timeline.clips.filter((c) => c.mediaId !== req.params.mediaId);
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
