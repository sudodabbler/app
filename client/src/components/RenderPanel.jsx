import React, { useState } from 'react';
import { api, pollJob, fileUrl } from '../api.js';
import { fmtDuration, fmtBytes } from '../lib/clips.js';

export default function RenderPanel({ project, health, onRendersChanged, canRender }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  const renders = project.renders || [];
  const busy = job && (job.status === 'queued' || job.status === 'running');

  async function startRender() {
    setError(null);
    try {
      const started = await api.render(project.id, {});
      setJob(started);
      const final = await pollJob(started.id, setJob);
      if (final.status === 'failed') setError(final.error || 'Render failed');
      await onRendersChanged();
    } catch (e) {
      setError(e.message);
      setJob(null);
    }
  }

  const ffmpegMissing = !health?.capabilities?.ffmpeg;

  return (
    <div className="panel flex flex-col min-h-0">
      <div className="panel-title">Render</div>
      <div className="px-3 pb-3 space-y-3 flex flex-col min-h-0">
        <button
          onClick={startRender}
          disabled={busy || !canRender || ffmpegMissing}
          className="btn w-full"
          title={
            ffmpegMissing
              ? 'ffmpeg not installed on server'
              : !canRender
                ? 'Add clips to the timeline first'
                : 'Render MP4 (1080×1920, 30fps)'
          }
        >
          {busy ? 'Rendering…' : 'Render video'}
        </button>

        {ffmpegMissing && (
          <p className="text-[11px] text-amber-400">
            Rendering needs ffmpeg on the server. Install it, then reload.
          </p>
        )}

        {busy && (
          <div>
            <div className="h-2 bg-ink-600 rounded overflow-hidden mb-1">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <div className="text-xs text-slate-400">{job.message}</div>
          </div>
        )}
        {error && <div className="text-xs text-rose-400">{error}</div>}

        <div className="text-xs text-slate-500">
          Output: MP4 · H.264/AAC · 1080×1920 · 30fps
        </div>

        <div className="border-t border-ink-600 pt-2 flex-1 min-h-0 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-400 mb-2">
            Recent renders ({renders.length})
          </div>
          {renders.length === 0 ? (
            <p className="text-xs text-slate-500">No renders yet.</p>
          ) : (
            <ul className="space-y-2">
              {renders.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 bg-ink-700 rounded-md p-2 border border-ink-600"
                >
                  <video
                    src={fileUrl(r.url)}
                    className="w-10 h-16 object-cover rounded bg-black shrink-0"
                    muted
                    preload="metadata"
                  />
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="text-slate-300 tabular-nums">
                      {fmtDuration(r.duration)} · {fmtBytes(r.sizeBytes)}
                    </div>
                    <div className="text-slate-500">
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <a
                    href={fileUrl(r.url)}
                    download
                    className="btn-ghost normal-case shrink-0"
                    title="Download"
                  >
                    ↓
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
