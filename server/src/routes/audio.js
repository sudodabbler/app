import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { paths } from '../config.js';
import { getProject, updateProject, ensureProjectDirs } from '../lib/db.js';
import { ingestAudio } from '../services/audio.js';
import { audioUrl } from '../lib/urls.js';

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        await ensureProjectDirs(req.params.id);
        cb(null, paths.audio(req.params.id));
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
  limits: { fileSize: 300 * 1024 * 1024 },
});

// POST /api/projects/:id/audio/upload  (multipart, field "file")
router.post('/:id/audio/upload', upload.single('file'), async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const originalName = req.file.originalname;
    const { filename, duration, peaks } = await ingestAudio(
      req.file.path,
      paths.audio(req.params.id),
    );

    const track = {
      id: nanoid(10),
      filename,
      originalName,
      url: audioUrl(req.params.id, filename),
      duration,
      peaks,
      createdAt: new Date().toISOString(),
    };

    await updateProject(req.params.id, (p) => {
      p.audio.tracks.push(track);
    });

    res.status(201).json(track);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id/audio/:audioId
router.delete('/:id/audio/:audioId', async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const track = project.audio.tracks.find((t) => t.id === req.params.audioId);
    if (!track) return res.status(404).json({ error: 'Audio track not found' });

    if (track.filename) {
      await fs.rm(path.join(paths.audio(req.params.id), track.filename), { force: true });
    }

    await updateProject(req.params.id, (p) => {
      p.audio.tracks = p.audio.tracks.filter((t) => t.id !== req.params.audioId);
      if (p.audio.selection?.audioId === req.params.audioId) {
        p.audio.selection = null;
      }
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
