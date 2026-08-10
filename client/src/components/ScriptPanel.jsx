import React, { useState } from 'react';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/**
 * Script/copy panel. The raw text is split into numbered beats (one per
 * non-empty line). Each beat can be toggled between "burn into video" and
 * "reference only", and dragged onto a clip in the timeline.
 */
export default function ScriptPanel({ script, onChange, selectedClip, onAssignBeat }) {
  const [raw, setRaw] = useState(script.raw || '');

  function reparse(text) {
    setRaw(text);
    const lines = text.split('\n').map((l) => l.trim());
    const existing = script.beats || [];
    let idx = 0;
    const beats = [];
    for (const line of lines) {
      if (!line) continue;
      // Preserve prior beat settings by position where possible.
      const prev = existing[idx];
      beats.push({
        id: prev?.id || uid(),
        index: idx + 1,
        text: line,
        burn: prev?.burn ?? false,
      });
      idx++;
    }
    onChange({ raw: text, beats });
  }

  function toggleBurn(id) {
    const beats = (script.beats || []).map((b) =>
      b.id === id ? { ...b, burn: !b.burn } : b,
    );
    onChange({ ...script, raw, beats });
  }

  const beats = script.beats || [];

  return (
    <div className="panel flex flex-col min-h-0">
      <div className="panel-title">Script / Copy</div>
      <div className="px-3 pb-3 flex flex-col gap-3 min-h-0">
        <textarea
          value={raw}
          onChange={(e) => reparse(e.target.value)}
          placeholder={'Hook line…\nBeat 2…\nCTA line…'}
          rows={4}
          className="field w-full resize-none"
        />

        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
          {beats.length === 0 && (
            <p className="text-xs text-slate-500">
              Type your script above — each line becomes a beat you can attach to a clip.
            </p>
          )}
          {beats.map((b) => (
            <div
              key={b.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-beat-id', b.id)}
              className="flex items-start gap-2 bg-ink-700 rounded-md px-2 py-1.5 border border-ink-600 group"
              title="Drag onto the selected clip to attach"
            >
              <span className="chip mt-0.5">{b.index}</span>
              <span className="flex-1 text-sm text-slate-200">{b.text}</span>
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={() => toggleBurn(b.id)}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    b.burn
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink-600 text-slate-400 hover:text-slate-200'
                  }`}
                  title={b.burn ? 'Burned into video' : 'Reference only'}
                >
                  {b.burn ? 'burn-in' : 'reference'}
                </button>
                {selectedClip && b.burn && (
                  <button
                    onClick={() => onAssignBeat(b.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-ink-600 text-slate-300 hover:bg-ink-500 opacity-0 group-hover:opacity-100"
                    title="Attach to selected clip"
                  >
                    → clip
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Burned-in captions render bottom-center, white with black outline, above TikTok's UI
          safe zone.
        </p>
      </div>
    </div>
  );
}
