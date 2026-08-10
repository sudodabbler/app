import { Router } from 'express';
import { getProject } from '../lib/db.js';
import { queue } from '../lib/queue.js';
import { PINTEREST_JOB } from '../services/pinterest.js';

const router = Router();

// POST /api/projects/:id/media/pinterest  { urls: string[] }
router.post('/:id/media/pinterest', async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const urls = Array.isArray(req.body?.urls)
      ? req.body.urls
      : String(req.body?.urls || '')
          .split(/[\s,]+/)
          .filter(Boolean);

    if (urls.length === 0) {
      return res.status(400).json({ error: 'Provide one or more Pinterest URLs' });
    }

    const job = queue.enqueue(PINTEREST_JOB, { projectId: req.params.id, urls });
    res.status(202).json(job);
  } catch (err) {
    next(err);
  }
});

export default router;
