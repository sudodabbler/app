import React, { useRef, useState, useEffect } from 'react';
import { api, fileUrl } from '../api.js';
import Waveform from './Waveform.jsx';
import { fmtDuration } from '../lib/clips.js';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function defaultSelection(track) {
  return {
    audioId: track.id,
    in: 0,
    out: track.duration || 15,
    volume: 1,
    fadeIn: 0.5,
    fadeOut: 0.8,
    loop: false,
    trimToAudio: true,
    originalAudio: 'keep',
    beatMarkers: [],
  };
}

export default function AudioPanel({ project, selection, onSelectionChange, onTracksChanged }) {
  const fileRef = useRef(null);
  const audioRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [playhead, setPlayhead] = useState(null);
  const [playing, setPlaying] = useState(false);

  const tracks = project.audio?.tracks || [];
  const track = selection ? tracks.find((t) => t.id === selection.audioId) : null;

  // Keep an <audio> element in sync for scrubbing/beat tapping/preview.
  useEffect(() => {
    setPlayhead(null);
    setPlaying(false);
  }, [selection?.audioId]);

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const t = await api.uploadAudio(project.id, file);
      await onTracksChanged();
      onSelectionChange(defaultSelection(t));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(t) {
    try {
      await api.deleteAudio(project.id, t.id);
      await onTracksChanged();
      if (selection?.audioId === t.id) onSelectionChange(null);
    } catch (e) {
      setError(e.message);
    }
  }

  const set = (patch) => onSelectionChange({ ...selection, ...patch });

  // Simple snippet playback for scrubbing / beat tapping.
  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.currentTime = selection.in || 0;
      el.volume = Math.min(1, selection.volume ?? 1);
      el.play();
      setPlaying(true);
    }
  }

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      setPlayhead(el.currentTime);
      if (selection && el.currentTime >= (selection.out || track?.duration || 0)) {
        el.pause();
        setPlaying(false);
      }
    };
    const onEnd = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
    };
  }, [selection, track]);

  function tapBeat() {
    if (playhead == null) return;
    const markers = [...(selection.beatMarkers || []), Number(playhead.toFixed(2))].sort(
      (a, b) => a - b,
    );
    set({ beatMarkers: markers });
  }

  return (
    <div className="panel flex flex-col">
      <div className="panel-title flex items-center justify-between">
        <span>Audio</span>
        <button onClick={() => fileRef.current?.click()} className="btn-ghost normal-case">
          {uploading ? 'Uploading…' : '+ Add audio'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/*,.mp3,.wav,.m4a,.mov,.mp4"
          className="hidden"
          onChange={(e) => {
            handleUpload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="px-3 pb-3 space-y-3">
        {error && <div className="text-xs text-rose-400">{error}</div>}

        {/* Track list */}
        {tracks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tracks.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-1 rounded-md pl-2 pr-1 py-1 text-xs border ${
                  selection?.audioId === t.id
                    ? 'bg-brand-600/20 border-brand-500'
                    : 'bg-ink-700 border-ink-600'
                }`}
              >
                <button
                  onClick={() =>
                    onSelectionChange(
                      selection?.audioId === t.id ? selection : defaultSelection(t),
                    )
                  }
                  className="max-w-[120px] truncate"
                  title={t.originalName}
                >
                  {t.originalName}
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="text-slate-500 hover:text-rose-400 px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {!track && (
          <p className="text-xs text-slate-500">
            Upload an MP3/WAV/M4A — or a MOV/MP4 to extract its audio track — then trim a snippet
            to lay under your sequence.
          </p>
        )}

        {track && (
          <>
            <audio ref={audioRef} src={fileUrl(track.url)} preload="auto" />

            <div className="flex items-center gap-2">
              <button onClick={togglePlay} className="btn-ghost">
                {playing ? '❚❚' : '►'}
              </button>
              <button onClick={tapBeat} className="btn-ghost" title="Tap a beat marker">
                ♩ Tap beat
              </button>
              {selection.beatMarkers?.length > 0 && (
                <button
                  onClick={() => set({ beatMarkers: [] })}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  clear {selection.beatMarkers.length} beats
                </button>
              )}
              <span className="ml-auto text-xs text-slate-400 tabular-nums">
                {fmtDuration(selection.in)} – {fmtDuration(selection.out)} (
                {fmtDuration((selection.out || 0) - (selection.in || 0))})
              </span>
            </div>

            <Waveform
              peaks={track.peaks}
              duration={track.duration || selection.out || 1}
              inPoint={selection.in}
              outPoint={selection.out}
              playhead={playhead}
              onChange={({ in: i, out }) => set({ in: i, out })}
              onScrub={(t) => {
                if (audioRef.current) audioRef.current.currentTime = t;
                setPlayhead(t);
              }}
            />
            {track.peaks?.length === 0 && (
              <p className="text-[11px] text-slate-500">
                Waveform unavailable (ffmpeg not present at upload) — you can still set in/out
                numerically by dragging the handles.
              </p>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Volume</span>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={selection.volume}
                  onChange={(e) => set({ volume: Number(e.target.value) })}
                  className="flex-1"
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Original</span>
                <select
                  value={selection.originalAudio}
                  onChange={(e) => set({ originalAudio: e.target.value })}
                  className="field"
                >
                  <option value="keep">Keep clip audio</option>
                  <option value="duck">Duck (~20%)</option>
                  <option value="mute">Mute clips</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Fade in</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={selection.fadeIn}
                  onChange={(e) => set({ fadeIn: Number(e.target.value) })}
                  className="field w-16 text-right"
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Fade out</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={selection.fadeOut}
                  onChange={(e) => set({ fadeOut: Number(e.target.value) })}
                  className="field w-16 text-right"
                />
              </label>
              <label className="flex items-center gap-2 col-span-2">
                <input
                  type="checkbox"
                  checked={selection.loop}
                  onChange={(e) => set({ loop: e.target.checked })}
                  className="accent-brand-500"
                />
                <span className="text-slate-300 text-sm">
                  Loop snippet if shorter than video
                </span>
              </label>
              {!selection.loop && (
                <label className="flex items-center gap-2 col-span-2">
                  <input
                    type="checkbox"
                    checked={selection.trimToAudio}
                    onChange={(e) => set({ trimToAudio: e.target.checked })}
                    className="accent-brand-500"
                  />
                  <span className="text-slate-300 text-sm">
                    Trim video to audio length (off = video keeps full length, music fades early)
                  </span>
                </label>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
