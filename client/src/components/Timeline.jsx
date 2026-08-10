import React, { useState } from 'react';
import { fileUrl } from '../api.js';
import { clipDuration, fmtDuration } from '../lib/clips.js';

const TARGETS = [15, 30, 60];
const PX_PER_SEC = 26;

function TransitionMarker({ clip, onToggle }) {
  const isX = clip.transition?.type === 'crossfade';
  return (
    <button
      onClick={onToggle}
      title={isX ? `Crossfade ${clip.transition.duration}s` : 'Cut (click for crossfade)'}
      className={`shrink-0 self-center w-6 h-6 rounded-full grid place-items-center text-xs border ${
        isX
          ? 'bg-brand-600/30 border-brand-500 text-brand-300'
          : 'bg-ink-700 border-ink-600 text-slate-500 hover:text-slate-300'
      }`}
    >
      {isX ? '⤫' : '│'}
    </button>
  );
}

function ClipBlock({ clip, media, dur, selected, onSelect, onDelete, onDuplicate, onDragStart, onDrop, dragging }) {
  const width = Math.max(64, dur * PX_PER_SEC);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
      style={{ width }}
      className={`group relative shrink-0 h-24 rounded-lg overflow-hidden border-2 transition ${
        selected ? 'border-brand-500' : 'border-ink-600 hover:border-ink-500'
      } ${dragging ? 'opacity-40' : ''} cursor-pointer`}
    >
      <div className="absolute inset-0 bg-ink-900">
        {media?.thumbnail && (
          <img src={fileUrl(media.thumbnail)} alt="" className="w-full h-full object-cover opacity-80" />
        )}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-1 py-0.5 bg-gradient-to-b from-black/70 to-transparent">
        <span className="chip bg-black/50">{clip.type === 'video' ? '▶' : '▦'}</span>
        {clip.captionBeatIds?.length > 0 && (
          <span className="chip bg-brand-600/80 text-white">CC</span>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-1 py-0.5 bg-gradient-to-t from-black/80 to-transparent">
        <span className="text-[11px] tabular-nums text-white/90">{fmtDuration(dur)}</span>
        <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="w-4 h-4 grid place-items-center bg-black/60 rounded text-[10px] hover:bg-ink-500"
            title="Duplicate"
          >
            ⧉
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-4 h-4 grid place-items-center bg-black/60 rounded text-[10px] hover:bg-rose-600"
            title="Delete"
          >
            ✕
          </button>
        </span>
      </div>
    </div>
  );
}

export default function Timeline({
  clips,
  mediaById,
  selectedClipId,
  onSelect,
  onReorder,
  onAddMedia,
  onDuplicate,
  onDelete,
  onToggleTransition,
  targetDuration,
  onTargetChange,
  totalSec,
}) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dropActive, setDropActive] = useState(false);

  const overTarget = totalSec > targetDuration + 0.05;

  function handleDropOnClip(e, index) {
    e.preventDefault();
    e.stopPropagation();
    const beatId = e.dataTransfer.getData('application/x-beat-id');
    const mediaId = e.dataTransfer.getData('application/x-media-id');
    if (beatId) {
      onAssignBeat(beatId, clips[index].id);
    } else if (mediaId) {
      onAddMedia(mediaId, index);
    } else if (dragIndex != null) {
      onReorder(dragIndex, index);
    }
    setDragIndex(null);
    setDropActive(false);
  }

  function handleDropOnEnd(e) {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData('application/x-media-id');
    if (mediaId) onAddMedia(mediaId, clips.length);
    else if (dragIndex != null) onReorder(dragIndex, clips.length);
    setDragIndex(null);
    setDropActive(false);
  }

  return (
    <div className="panel flex flex-col">
      <div className="panel-title flex items-center justify-between">
        <span>Timeline</span>
        <div className="flex items-center gap-2 normal-case tracking-normal">
          <span className="text-slate-500">Target</span>
          {TARGETS.map((t) => (
            <button
              key={t}
              onClick={() => onTargetChange(t)}
              className={`px-1.5 py-0.5 rounded text-xs ${
                targetDuration === t ? 'bg-brand-600 text-white' : 'bg-ink-700 text-slate-400'
              }`}
            >
              {t}s
            </button>
          ))}
          <span
            className={`ml-2 tabular-nums font-semibold ${
              overTarget ? 'text-amber-400' : 'text-emerald-400'
            }`}
            title={overTarget ? 'Over target duration' : 'Within target'}
          >
            {fmtDuration(totalSec)}
          </span>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={handleDropOnEnd}
        className={`mx-3 mb-3 mt-1 p-3 rounded-lg border overflow-x-auto ${
          dropActive ? 'border-brand-500/60 bg-brand-600/5' : 'border-ink-600 bg-ink-900/40'
        }`}
      >
        {clips.length === 0 ? (
          <div className="h-24 grid place-items-center text-sm text-slate-500">
            Drag media here to build your sequence
          </div>
        ) : (
          <div className="flex items-stretch gap-1 min-w-min">
            {clips.map((clip, i) => (
              <React.Fragment key={clip.id}>
                <ClipBlock
                  clip={clip}
                  media={mediaById.get(clip.mediaId)}
                  dur={clipDuration(clip, mediaById.get(clip.mediaId))}
                  selected={clip.id === selectedClipId}
                  dragging={dragIndex === i}
                  onSelect={() => onSelect(clip.id)}
                  onDelete={() => onDelete(clip.id)}
                  onDuplicate={() => onDuplicate(clip.id)}
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/x-clip-index', String(i));
                  }}
                  onDrop={(e) => handleDropOnClip(e, i)}
                />
                {i < clips.length - 1 && (
                  <TransitionMarker clip={clip} onToggle={() => onToggleTransition(clip.id)} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
