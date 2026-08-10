import React from 'react';
import { fmtDuration } from '../lib/clips.js';

function CapBadge({ ok, label, hint }) {
  return (
    <span
      title={hint}
      className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${
        ok
          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
          : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
      }`}
    >
      {ok ? '●' : '○'} {label}
    </span>
  );
}

export default function TopBar({
  health,
  projects,
  currentId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  project,
  totalSec,
}) {
  const caps = health?.capabilities || {};
  return (
    <header className="flex items-center gap-4 px-4 h-14 border-b border-ink-600 bg-ink-800 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 grid place-items-center font-bold text-white">
          C
        </div>
        <span className="font-semibold tracking-tight">ClipStitch</span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={currentId || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="bg-ink-700 border border-ink-600 rounded-md px-2 py-1 text-sm max-w-[220px]"
        >
          {projects.length === 0 && <option value="">No projects</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={onNew} className="btn-ghost" title="New project">
          + New
        </button>
        {project && (
          <>
            <button onClick={onRename} className="btn-ghost" title="Rename">
              Rename
            </button>
            <button onClick={onDelete} className="btn-ghost text-rose-300" title="Delete project">
              Delete
            </button>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-4">
        {project && (
          <div className="text-sm text-slate-400">
            Sequence:{' '}
            <span className="text-slate-100 font-semibold tabular-nums">
              {fmtDuration(totalSec)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <CapBadge
            ok={caps.ffmpeg}
            label="ffmpeg"
            hint={caps.ffmpeg ? 'Rendering available' : 'ffmpeg missing — rendering disabled'}
          />
          <CapBadge
            ok={caps.galleryDl}
            label="gallery-dl"
            hint={
              caps.galleryDl
                ? 'Pinterest import available'
                : 'gallery-dl missing — use direct upload'
            }
          />
        </div>
      </div>
    </header>
  );
}
