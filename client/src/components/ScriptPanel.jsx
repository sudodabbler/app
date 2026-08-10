import React, { useState } from 'react';
import { CAPTION_FONTS, CAPTION_SIZE } from '../lib/clips.js';

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
    // A blank line separates beats; single line breaks stay *within* a beat so
    // multi-line captions render as written.
    const blocks = text.split(/\n[ \t]*\n/);
    const existing = script.beats || [];
    let idx = 0;
    const beats = [];
    for (const block of blocks) {
      const t = block.replace(/[ \t]+$/gm, '').trim(); // keep internal newlines
      if (!t) continue;
      const prev = existing[idx];
      beats.push({
        id: prev?.id || uid(),
        index: idx + 1,
        text: t,
        burn: prev?.burn ?? false,
      });
      idx++;
    }
    onChange({ ...script, raw: text, beats });
  }

  function toggleBurn(id) {
    const beats = (script.beats || []).map((b) =>
      b.id === id ? { ...b, burn: !b.burn } : b,
    );
    onChange({ ...script, raw, beats });
  }

  const captionColor = script.captionStyle?.color || '#ffffff';
  const outline = script.captionStyle?.outline !== false;
  const fontKey = script.captionStyle?.font || 'classic';
  const size =
    typeof script.captionStyle?.size === 'number' ? script.captionStyle.size : CAPTION_SIZE.default;
  function setStyle(patchObj) {
    onChange({ ...script, raw, captionStyle: { ...script.captionStyle, ...patchObj } });
  }
  const setColor = (color) => setStyle({ color });

  const PRESETS = ['#ffffff', '#000000', '#ff2d55', '#ffd60a', '#00e5ff', '#34c759'];

  const beats = script.beats || [];

  return (
    <div className="panel flex flex-col min-h-0">
      <div className="panel-title">Script / Copy</div>
      <div className="px-3 pb-3 flex flex-col gap-3 min-h-0">
        <textarea
          value={raw}
          onChange={(e) => reparse(e.target.value)}
          placeholder={'Hook line…\n(blank line = new caption)\n\nCTA line…'}
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
              <span className="flex-1 text-sm text-slate-200 whitespace-pre-line">{b.text}</span>
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
        {/* Caption style */}
        <div className="border-t border-ink-600 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Caption style</span>
            <span
              className="text-sm px-2 py-0.5 rounded"
              style={{
                fontFamily: `'${(CAPTION_FONTS[fontKey] || CAPTION_FONTS.classic).css}', sans-serif`,
                color: captionColor,
                textShadow: outline ? '0 0 3px #000, 1px 1px 2px #000' : 'none',
              }}
            >
              Aa TikTok
            </span>
          </div>

          {/* Font family */}
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 w-10">Font</span>
            <select
              value={fontKey}
              onChange={(e) => setStyle({ font: e.target.value })}
              className="field flex-1"
            >
              {Object.entries(CAPTION_FONTS).map(([key, f]) => (
                <option key={key} value={key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          {/* Size */}
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 w-10">Size</span>
            <input
              type="range"
              min={CAPTION_SIZE.min}
              max={CAPTION_SIZE.max}
              step="0.002"
              value={size}
              onChange={(e) => setStyle({ size: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="text-xs text-slate-500 tabular-nums w-8 text-right">
              {Math.round((size / CAPTION_SIZE.default) * 100)}%
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={captionColor}
              onChange={(e) => setColor(e.target.value)}
              className="w-9 h-9 rounded bg-transparent cursor-pointer border border-ink-600 p-0.5"
              title="Pick any color"
            />
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border ${
                    captionColor.toLowerCase() === c
                      ? 'border-white ring-2 ring-brand-500'
                      : 'border-ink-500'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Outline</span>
            <div className="flex gap-1">
              <button
                onClick={() => setStyle({ outline: true })}
                className={`px-2 py-1 rounded text-xs ${
                  outline ? 'bg-brand-600 text-white' : 'bg-ink-700 text-slate-400'
                }`}
              >
                Border
              </button>
              <button
                onClick={() => setStyle({ outline: false })}
                className={`px-2 py-1 rounded text-xs ${
                  !outline ? 'bg-brand-600 text-white' : 'bg-ink-700 text-slate-400'
                }`}
              >
                None
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Captions use the TikTok-style font. Drag them in the preview to reposition (snaps to
            centre); they stay above TikTok's UI safe zone.
          </p>
        </div>
      </div>
    </div>
  );
}
