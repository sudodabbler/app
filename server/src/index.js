import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config, paths } from './config.js';
import { ensureDataDirs } from './lib/db.js';
import { ffmpegAvailable, ffprobeAvailable } from './services/media.js';
import { registerRenderWorker } from './services/render.js';
import { registerPinterestWorker, galleryDlAvailable } from './services/pinterest.js';

import projectsRouter from './routes/projects.js';
import mediaRouter from './routes/media.js';
import pinterestRouter from './routes/pinterest.js';
import audioRouter from './routes/audio.js';
import renderRouter from './routes/render.js';
import jobsRouter from './routes/jobs.js';

await ensureDataDirs();
registerRenderWorker();
registerPinterestWorker();

const app = express();

app.use(
  cors({
    origin: config.corsOrigins.length ? config.corsOrigins : true,
  }),
);
app.use(express.json({ limit: '5mb' }));

// Serve stored media / thumbnails / audio / renders straight from disk.
app.use('/files', express.static(paths.projects(), { fallthrough: true }));

// Serve bundled assets (e.g. the caption font) so the client preview can use
// the exact same font ffmpeg burns into the render.
app.use('/assets', express.static(config.assetsDir));

// Capabilities probe so the UI can warn when render/import won't work.
app.get('/api/health', async (_req, res) => {
  const [ffmpeg, ffprobe, galleryDl] = await Promise.all([
    ffmpegAvailable(),
    ffprobeAvailable(),
    galleryDlAvailable(),
  ]);
  res.json({
    ok: true,
    capabilities: { ffmpeg, ffprobe, galleryDl },
    output: config.output,
    limits: {
      maxPinterestItems: config.maxPinterestItems,
      maxRendersKept: config.maxRendersKept,
    },
  });
});

app.use('/api/projects', projectsRouter);
app.use('/api/projects', mediaRouter);
app.use('/api/projects', pinterestRouter);
app.use('/api/projects', audioRouter);
app.use('/api/projects', renderRouter);
app.use('/api/jobs', jobsRouter);

// Optionally serve the built client if present (single-service deploy).
const clientDist = path.resolve(paths.root, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/files')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Central error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

app.listen(config.port, () => {
  console.log(`ClipStitch server listening on http://localhost:${config.port}`);
  console.log(`Data directory: ${config.dataDir}`);
});
