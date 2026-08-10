import { Router } from 'express';
import {
  createProject,
  getProject,
  listProjects,
  deleteProject,
  saveProject,
} from '../lib/db.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    res.json(await listProjects());
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const project = await createProject(req.body?.name);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    next(err);
  }
});

/**
 * Autosave endpoint. Accepts partial updates to the editable slices of a
 * project (name, script, timeline, audio). Media and renders are managed by
 * their own endpoints and are not overwritten here.
 */
router.put('/:id', async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { name, script, timeline, audio } = req.body || {};
    if (typeof name === 'string') project.name = name;
    if (script && typeof script === 'object') project.script = script;
    if (timeline && typeof timeline === 'object') project.timeline = timeline;
    if (audio && typeof audio === 'object') {
      // Preserve the uploaded track list; only the selection is client-owned.
      project.audio = { ...project.audio, ...audio, tracks: project.audio.tracks };
    }

    await saveProject(project);
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await deleteProject(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
