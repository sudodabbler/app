import React from 'react';
import { fileUrl } from '../api.js';
import { clipDuration, fmtDuration } from '../lib/clips.js';

function Row({ label, children }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-400 w-28 shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2 justify-end">{children}</div>
    </label>
  );
}

const FITS = [
  { v: 'center-crop', label: 'Center crop' },
  { v: 'blur', label: 'Blur bg' },
  { v: 'reposition', label: 'Reposition' },
];

export default function ClipInspector({ clip, media, beats, aspectRatio = '9:16', onChange, onClose }) {
  if (!clip) return null;
  const isVideo = media?.type === 'video';
  const set = (patch) => onChange({ ...clip, ...patch });

  const burnBeats = beats.filter((b) => b.burn);

  return (
    <div className="panel">
      <div className="panel-title flex items-center justify-between">
        <span>Clip settings</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 normal-case">
          ✕
        </button>
      </div>
      <div className="px-3 pb-3 space-y-3">
        <div className="flex gap-3">
          <div className="w-16 h-28 rounded-md overflow-hidden bg-ink-900 shrink-0">
            {media?.thumbnail && (
              <img src={fileUrl(media.thumbnail)} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            <div className="text-slate-200">{media?.type} clip</div>
            {media?.width && (
              <div>
                Source: {media.width}×{media.height}
              </div>
            )}
            <div>On screen: {fmtDuration(clipDuration(clip, media))}</div>
            {media?.source === 'pinterest' && media.sourceUrl && (
              <a
                href={media.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-brand-400 hover:underline block truncate max-w-[160px]"
              >
                source pin ↗
              </a>
            )}
          </div>
        </div>

        {!isVideo && (
          <Row label="Duration">
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.1"
              value={clip.duration}
              onChange={(e) => set({ duration: Number(e.target.value) })}
              className="flex-1"
            />
            <input
              type="number"
              min="0.5"
              max="10"
              step="0.1"
              value={clip.duration}
              onChange={(e) => set({ duration: Number(e.target.value) })}
              className="field w-16 text-right"
            />
          </Row>
        )}

        {isVideo && (
          <>
            <Row label="Trim in">
              <input
                type="number"
                min="0"
                step="0.1"
                value={clip.trimIn ?? 0}
                onChange={(e) => set({ trimIn: Math.max(0, Number(e.target.value)) })}
                className="field w-20 text-right"
              />
              <span className="text-slate-500 text-xs">s</span>
            </Row>
            <Row label="Trim out">
              <input
                type="number"
                min="0"
                step="0.1"
                value={clip.trimOut ?? media?.duration ?? 0}
                onChange={(e) => set({ trimOut: Number(e.target.value) })}
                className="field w-20 text-right"
              />
              <span className="text-slate-500 text-xs">s</span>
            </Row>
            <Row label={`Speed ${clip.speed}×`}>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={clip.speed}
                onChange={(e) => set({ speed: Number(e.target.value) })}
                className="flex-1"
              />
            </Row>
          </>
        )}

        <Row label={`Fit to ${aspectRatio}`}>
          <div className="flex gap-1">
            {FITS.map((f) => (
              <button
                key={f.v}
                onClick={() => set({ fit: f.v })}
                className={`px-2 py-1 rounded text-xs ${
                  clip.fit === f.v ? 'bg-brand-600 text-white' : 'bg-ink-700 text-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Row>

        {clip.fit === 'reposition' && (
          <>
            <Row label={`Zoom ${clip.scale}×`}>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={clip.scale}
                onChange={(e) => set({ scale: Number(e.target.value) })}
                className="flex-1"
              />
            </Row>
            <Row label="Offset X">
              <input
                type="range"
                min="-400"
                max="400"
                step="10"
                value={clip.offsetX}
                onChange={(e) => set({ offsetX: Number(e.target.value) })}
                className="flex-1"
              />
            </Row>
            <Row label="Offset Y">
              <input
                type="range"
                min="-600"
                max="600"
                step="10"
                value={clip.offsetY}
                onChange={(e) => set({ offsetY: Number(e.target.value) })}
                className="flex-1"
              />
            </Row>
          </>
        )}

        {clip.transition && (
          <Row label="Transition">
            <select
              value={clip.transition.type}
              onChange={(e) =>
                set({ transition: { ...clip.transition, type: e.target.value } })
              }
              className="field"
            >
              <option value="cut">Cut</option>
              <option value="crossfade">Crossfade</option>
            </select>
            {clip.transition.type === 'crossfade' && (
              <input
                type="number"
                min="0.2"
                max="0.5"
                step="0.1"
                value={clip.transition.duration}
                onChange={(e) =>
                  set({ transition: { ...clip.transition, duration: Number(e.target.value) } })
                }
                className="field w-16 text-right"
              />
            )}
          </Row>
        )}

        {/* Caption assignment */}
        <div className="pt-1 border-t border-ink-600">
          <div className="text-xs text-slate-400 mb-1">Captions on this clip</div>
          {burnBeats.length === 0 ? (
            <p className="text-xs text-slate-500">
              Mark script beats as “burn in” to attach them here.
            </p>
          ) : (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {burnBeats.map((b) => {
                const on = clip.captionBeatIds?.includes(b.id);
                return (
                  <label
                    key={b.id}
                    className="flex items-start gap-2 text-xs cursor-pointer hover:bg-ink-700 rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const ids = new Set(clip.captionBeatIds || []);
                        if (e.target.checked) ids.add(b.id);
                        else ids.delete(b.id);
                        set({ captionBeatIds: [...ids] });
                      }}
                      className="mt-0.5 accent-brand-500"
                    />
                    <span className="text-slate-300">{b.text}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
