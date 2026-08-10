// API base is empty by default: relative URLs are proxied to the backend in
// dev (see vite.config.js) and hit the same origin in a combined deploy.
const BASE = import.meta.env.VITE_API_BASE || '';

export function fileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${BASE}${url}`;
}

async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

async function upload(path, formData) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

export const api = {
  health: () => req('GET', '/api/health'),

  // Projects
  listProjects: () => req('GET', '/api/projects'),
  createProject: (name) => req('POST', '/api/projects', { name }),
  getProject: (id) => req('GET', `/api/projects/${id}`),
  saveProject: (id, patch) => req('PUT', `/api/projects/${id}`, patch),
  deleteProject: (id) => req('DELETE', `/api/projects/${id}`),

  // Media
  listMedia: (id) => req('GET', `/api/projects/${id}/media`),
  uploadMedia: (id, files) => {
    const fd = new FormData();
    [...files].forEach((f) => fd.append('files', f));
    return upload(`/api/projects/${id}/media/upload`, fd);
  },
  importPinterest: (id, urls) => req('POST', `/api/projects/${id}/media/pinterest`, { urls }),
  deleteMedia: (id, mediaId) => req('DELETE', `/api/projects/${id}/media/${mediaId}`),

  // Audio
  uploadAudio: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return upload(`/api/projects/${id}/audio/upload`, fd);
  },
  deleteAudio: (id, audioId) => req('DELETE', `/api/projects/${id}/audio/${audioId}`),

  // Render + jobs
  render: (id, options) => req('POST', `/api/projects/${id}/render`, { options }),
  listRenders: (id) => req('GET', `/api/projects/${id}/renders`),
  getJob: (jobId) => req('GET', `/api/jobs/${jobId}`),
};

// Poll a job until it finishes; onUpdate receives each status snapshot.
export async function pollJob(jobId, onUpdate, intervalMs = 900) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await api.getJob(jobId);
    onUpdate?.(job);
    if (job.status === 'done' || job.status === 'failed') return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
