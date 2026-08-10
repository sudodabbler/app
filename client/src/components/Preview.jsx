import React, { useRef, useState, useEffect, useCallback } from 'react';
import { fileUrl } from '../api.js';
import { clipDuration, fmtDuration, totalDuration } from '../lib/clips.js';

/**
 * Rough in-browser preview: steps through the clip sequence, applying the
 * chosen fit, playing videos at their trim/speed, showing burned captions,
 * and playing the selected audio snippet underneath. This is an approximation
 * of the final render, not a frame-accurate match.
 */
export default function Preview({ clips, mediaById, beats, audioSelection, tracks }) {
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const idxRef = useRef(-1);

  const track = audioSelection ? tracks.find((t) => t.id === audioSelection.audioId) : null;
  const total = totalDuration(clips, mediaById);

  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
    setPlaying(false);
    setIndex(-1);
    idxRef.current = -1;
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
  }, []);

  const playClip = useCallback(
    (i) => {
      if (i >= clips.length) {
        stop();
        return;
      }
      idxRef.current = i;
      setIndex(i);
      const clip = clips[i];
      const media = mediaById.get(clip.mediaId);
      const dur = clipDuration(clip, media);

      if (media?.type === 'video' && videoRef.current) {
        const v = videoRef.current;
        v.src = fileUrl(media.url);
        v.playbackRate = Math.min(2, Math.max(0.5, clip.speed || 1));
        v.currentTime = clip.trimIn || 0;
        v.muted = audioSelection?.originalAudio === 'mute' || !!track;
        v.play().catch(() => {});
      } else if (videoRef.current) {
        videoRef.current.pause();
      }

      timerRef.current = setTimeout(() => playClip(i + 1), dur * 1000);
    },
    [clips, mediaById, stop, audioSelection, track],
  );

  const play = useCallback(() => {
    if (clips.length === 0) return;
    setPlaying(true);
    if (track && audioRef.current) {
      const a = audioRef.current;
      a.src = fileUrl(track.url);
      a.currentTime = audioSelection.in || 0;
      a.volume = Math.min(1, audioSelection.volume ?? 1);
      a.play().catch(() => {});
    }
    playClip(0);
  }, [clips, track, audioSelection, playClip]);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  // Stop if the sequence changes mid-play.
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips.length]);

  const clip = index >= 0 ? clips[index] : null;
  const media = clip ? mediaById.get(clip.mediaId) : null;
  const staticMedia = media || (clips[0] && mediaById.get(clips[0].mediaId));

  const activeCaptions = (clip?.captionBeatIds || [])
    .map((id) => beats.find((b) => b.id === id))
    .filter((b) => b?.burn && b.text);

  const fit = clip?.fit || staticMedia?.fit;
  const imgClass =
    fit === 'blur' ? 'object-contain' : 'object-cover';
  const imgStyle =
    clip?.fit === 'reposition'
      ? {
          transform: `scale(${clip.scale || 1}) translate(${(clip.offsetX || 0) / 10}px, ${
            (clip.offsetY || 0) / 10
          }px)`,
        }
      : {};

  return (
    <div className="panel flex flex-col items-center">
      <div className="panel-title w-full flex items-center justify-between">
        <span>Preview</span>
        <span className="normal-case tracking-normal text-slate-500 tabular-nums">
          {fmtDuration(total)}
        </span>
      </div>

      <div className="relative w-[220px] aspect-[9/16] bg-black rounded-lg overflow-hidden mb-3 mx-3 shadow-lg">
        {/* Blur background layer */}
        {fit === 'blur' && staticMedia?.thumbnail && (
          <img
            src={fileUrl(staticMedia.thumbnail)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-70"
          />
        )}

        {/* Active media */}
        {media?.type === 'video' ? (
          <video
            ref={videoRef}
            className={`relative w-full h-full ${imgClass}`}
            style={imgStyle}
            playsInline
          />
        ) : staticMedia?.url || staticMedia?.thumbnail ? (
          <img
            src={fileUrl(staticMedia.url || staticMedia.thumbnail)}
            alt=""
            className={`relative w-full h-full ${imgClass}`}
            style={imgStyle}
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-slate-600 text-xs">
            Add clips to preview
          </div>
        )}
        {/* keep a hidden video element for warm-up even on image clips */}
        {media?.type !== 'video' && <video ref={videoRef} className="hidden" />}

        {/* Safe-zone guide (bottom 15%) */}
        <div className="absolute inset-x-0 bottom-0 h-[15%] border-t border-dashed border-white/20 bg-black/10 pointer-events-none" />

        {/* Burned captions */}
        {activeCaptions.length > 0 && (
          <div className="absolute inset-x-2 bottom-[18%] text-center pointer-events-none">
            {activeCaptions.map((b) => (
              <p
                key={b.id}
                className="text-white text-[13px] font-bold leading-tight"
                style={{ textShadow: '0 0 3px #000, 1px 1px 2px #000, -1px -1px 2px #000' }}
              >
                {b.text}
              </p>
            ))}
          </div>
        )}
      </div>

      <audio ref={audioRef} className="hidden" />

      <div className="flex items-center gap-2 pb-3">
        {!playing ? (
          <button onClick={play} className="btn" disabled={clips.length === 0}>
            ► Play preview
          </button>
        ) : (
          <button onClick={stop} className="btn-ghost">
            ❚❚ Stop
          </button>
        )}
        {playing && (
          <span className="text-xs text-slate-400">
            Clip {index + 1}/{clips.length}
          </span>
        )}
      </div>
    </div>
  );
}
