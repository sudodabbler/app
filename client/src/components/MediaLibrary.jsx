import React, { useState, useRef } from 'react';
import { api, pollJob, fileUrl } from '../api.js';
import { fmtDuration } from '../lib/clips.js';

function StatusDot({ status }) {
  const map = {
    fetched: 'bg-emerald-400',
    pending: 'bg-amber-400 animate-pulse',
    failed: 'bg-rose-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] || 'bg-slate-500'}`} />;
}

function MediaCard({ item, onDelete, onAdd }) {
  const failed = item.status === 'failed';
  return (
    <div
      draggable={!failed}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-media-id', item.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={() => !failed && onAdd(item)}
      className={`group relative rounded-lg overflow-hidden border border-ink-600 bg-ink-700 ${
        failed ? 'opacity-70' : 'cursor-grab active:cursor-grabbing hover:border-brand-500/60'
      }`}
      title={failed ? item.error || 'Failed' : 'Drag to timeline (or double-click to add)'}
    >
      <div className="aspect-[9/16] bg-ink-900 grid place-items-center overflow-hidden">
        {item.thumbnail ? (
          <img
            src={fileUrl(item.thumbnail)}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : failed ? (
          <span className="text-rose-400 text-2xl">⚠</span>
        ) : (
          <span className="text-slate-500 text-xs px-2 text-center">no preview</span>
        )}
      </div>

      <div className="absolute top-1 left-1 flex items-center gap-1">
        <span className="chip flex items-center gap-1">
          <StatusDot status={item.status} />
          {item.type}
        </span>
      </div>

      {item.type === 'video' && item.duration != null && (
        <span className="absolute bottom-1 right-1 chip tabular-nums">
          {fmtDuration(item.duration)}
        </span>
      )}
      {item.source === 'pinterest' && (
        <span className="absolute bottom-1 left-1 chip bg-brand-600/70 text-white">pin</span>
      )}

      <button
        onClick={() => onDelete(item)}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition bg-black/60
          hover:bg-rose-600 rounded w-5 h-5 grid place-items-center text-xs"
        title="Remove"
      >
        ✕
      </button>
    </div>
  );
}

export default function MediaLibrary({ project, health, onMediaChanged, onAddToTimeline }) {
  const [urls, setUrls] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const media = project.media || [];

  async function handleUpload(files) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadMedia(project.id, files);
      await onMediaChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleImport() {
    const list = urls.split(/[\s,]+/).map((u) => u.trim()).filter(Boolean);
    if (!list.length) return;
    setImporting(true);
    setError(null);
    setImportStatus({ progress: 0, message: 'Queued' });
    try {
      const job = await api.importPinterest(project.id, list);
      const final = await pollJob(job.id, (j) =>
        setImportStatus({ progress: j.progress, message: j.message }),
      );
      if (final.status === 'failed') {
        setError(final.error || 'Import failed');
      } else {
        setUrls('');
        const r = final.result?.results || [];
        const ok = r.filter((x) => x.status === 'fetched').length;
        setImportStatus({ progress: 100, message: `Imported ${final.result?.imported ?? 0} items` });
      }
      await onMediaChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
      setTimeout(() => setImportStatus(null), 4000);
    }
  }

  async function handleDelete(item) {
    try {
      await api.deleteMedia(project.id, item.id);
      await onMediaChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="panel flex flex-col h-full min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>Media Library</span>
        <span className="text-slate-500 normal-case tracking-normal">{media.length} items</span>
      </div>

      {/* Import controls */}
      <div className="px-3 space-y-2">
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          placeholder="Paste Pinterest board or pin URLs (one per line)…"
          rows={2}
          className="field w-full resize-none"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            disabled={importing || !urls.trim() || !health?.capabilities?.galleryDl}
            className="btn flex-1"
            title={
              health?.capabilities?.galleryDl
                ? 'Fetch media from Pinterest'
                : 'gallery-dl not installed on server'
            }
          >
            {importing ? 'Importing…' : 'Import from Pinterest'}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-ghost"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>

        {health && !health.capabilities?.galleryDl && (
          <p className="text-[11px] text-amber-400">
            Pinterest import needs the <code className="text-amber-300">gallery-dl</code> tool
            installed on the server. Until then, use <strong>Upload</strong> or drag &amp; drop
            your own files below.
          </p>
        )}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              handleUpload(e.target.files);
              e.target.value = '';
            }}
          />
        {importStatus && (
          <div className="text-xs text-slate-400">
            <div className="h-1.5 bg-ink-600 rounded overflow-hidden mb-1">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${importStatus.progress}%` }}
              />
            </div>
            {importStatus.message}
          </div>
        )}
        {error && <div className="text-xs text-rose-400">{error}</div>}
      </div>

      {/* Grid / dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files);
        }}
        className={`flex-1 min-h-0 overflow-y-auto mt-2 p-3 ${
          dragOver ? 'bg-brand-600/10 ring-1 ring-inset ring-brand-500/40' : ''
        }`}
      >
        {media.length === 0 ? (
          <div className="h-full min-h-[120px] grid place-items-center text-center text-sm text-slate-500 border border-dashed border-ink-600 rounded-lg">
            <div>
              <p>Drag & drop files here</p>
              <p className="text-xs mt-1">or import from Pinterest above</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {media.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onDelete={handleDelete}
                onAdd={onAddToTimeline}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
