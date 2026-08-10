import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config, paths } from '../config.js';

/**
 * Dead-simple project store: one project.json per project directory.
 * Writes are atomic (temp file + rename) so an interrupted autosave never
 * leaves a half-written, unparseable project file.
 */

export async function ensureDataDirs() {
  await fs.mkdir(paths.projects(), { recursive: true });
}

async function ensureProjectDirs(id) {
  await Promise.all([
    fs.mkdir(paths.media(id), { recursive: true }),
    fs.mkdir(paths.thumbs(id), { recursive: true }),
    fs.mkdir(paths.audio(id), { recursive: true }),
    fs.mkdir(paths.renders(id), { recursive: true }),
    fs.mkdir(paths.tmp(id), { recursive: true }),
  ]);
}

function emptyProject(id, name) {
  const now = new Date().toISOString();
  return {
    id,
    name: name || 'Untitled project',
    createdAt: now,
    updatedAt: now,
    media: [], // MediaItem[]
    script: {
      raw: '',
      beats: [], // { id, index, text, burn }
    },
    timeline: {
      clips: [], // Clip[]
      targetDuration: 30, // seconds, UI indicator only
    },
    audio: {
      tracks: [], // AudioTrack[] (uploaded sources)
      selection: null, // { audioId, in, out, volume, fadeIn, fadeOut, loop, originalAudio, beatMarkers }
    },
    renders: [], // RenderRecord[]
  };
}

async function atomicWrite(file, data) {
  const tmp = `${file}.${nanoid(6)}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

export async function createProject(name) {
  const id = nanoid(10);
  await ensureProjectDirs(id);
  const project = emptyProject(id, name);
  await atomicWrite(paths.projectFile(id), JSON.stringify(project, null, 2));
  return project;
}

export async function getProject(id) {
  try {
    const raw = await fs.readFile(paths.projectFile(id), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  await ensureProjectDirs(project.id);
  await atomicWrite(paths.projectFile(project.id), JSON.stringify(project, null, 2));
  return project;
}

/**
 * Load, mutate via `fn`, and persist. `fn` may be async and may return the
 * project (or mutate in place). Returns the saved project.
 */
export async function updateProject(id, fn) {
  const project = await getProject(id);
  if (!project) return null;
  const result = (await fn(project)) || project;
  return saveProject(result);
}

export async function listProjects() {
  await ensureDataDirs();
  let entries = [];
  try {
    entries = await fs.readdir(paths.projects(), { withFileTypes: true });
  } catch {
    return [];
  }
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const project = await getProject(entry.name);
    if (!project) continue;
    projects.push({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      mediaCount: project.media.length,
      clipCount: project.timeline.clips.length,
      renderCount: project.renders.length,
    });
  }
  projects.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return projects;
}

export async function deleteProject(id) {
  const dir = paths.project(id);
  await fs.rm(dir, { recursive: true, force: true });
}

export { ensureProjectDirs };
