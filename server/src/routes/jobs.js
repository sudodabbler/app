import { Router } from 'express';
import { queue } from '../lib/queue.js';

const router = Router();

// GET /api/jobs/:jobId  — poll job status
router.get('/:jobId', (req, res) => {
  const job = queue.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

export default router;
