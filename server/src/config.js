import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo root is two levels up from server/src.
const rootDir = path.resolve(__dirname, '..', '..');

export const config = {
  port: Number(process.env.PORT) || 4000,

  // Root directory for all persisted state (projects, media, renders).
  // Kept outside src so a rebuild never clobbers user data.
  dataDir: process.env.CLIPSTITCH_DATA_DIR || path.join(rootDir, 'data'),

  // External binaries. Overridable so deploys can point at absolute paths.
  ffmpegBin: process.env.FFMPEG_BIN || 'ffmpeg',
  ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe',
  galleryDlBin: process.env.GALLERY_DL_BIN || 'gallery-dl',

  // Bundled caption font (Montserrat Bold — a free stand-in for TikTok's
  // proprietary default). Served to the client for the preview and used by
  // ffmpeg drawtext for burned-in captions. Override with CLIPSTITCH_FONT.
  assetsDir: path.join(rootDir, 'server', 'assets'),
  captionFont: path.join(rootDir, 'server', 'assets', 'fonts', 'Caption.ttf'),

  // Ingest / render limits.
  maxPinterestItems: Number(process.env.MAX_PINTEREST_ITEMS) || 100,
  maxRendersKept: Number(process.env.MAX_RENDERS_KEPT) || 10,

  // Output video spec.
  output: {
    width: 1080,
    height: 1920,
    fps: 30,
    videoBitrate: '10M',
    maxrate: '12M',
    bufsize: '20M',
    audioBitrate: '192k',
  },

  // Front-end origin(s) allowed by CORS. Comma-separated env, or allow all in dev.
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
};

export const paths = {
  root: rootDir,
  projects: () => path.join(config.dataDir, 'projects'),
  project: (id) => path.join(config.dataDir, 'projects', id),
  projectFile: (id) => path.join(config.dataDir, 'projects', id, 'project.json'),
  media: (id) => path.join(config.dataDir, 'projects', id, 'media'),
  thumbs: (id) => path.join(config.dataDir, 'projects', id, 'thumbnails'),
  audio: (id) => path.join(config.dataDir, 'projects', id, 'audio'),
  renders: (id) => path.join(config.dataDir, 'projects', id, 'renders'),
  tmp: (id) => path.join(config.dataDir, 'projects', id, 'tmp'),
};
