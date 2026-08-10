import { Router } from 'express';
import { getProject } from '../lib/db.js';
import { queue } from '../lib/queue.js';
import { RENDER_JOB } from '../services/render.js';

const router = Router();

// POST /api/projects/:id/render  { options? }
router.post('/:id/render', async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.timeline.clips?.length) {
      return res.status(400).json({ error: 'Timeline is empty' });
    }
    const job = queue.enqueue(RENDER_JOB, {
      projectId: req.params.id,
      options: req.body?.options || {},
    });
    res.status(202).json(job);
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id/renders  — render history
router.get('/:id/renders', async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project.renders);
  } catch (err) {
    next(err);
  }
});

export default router;
