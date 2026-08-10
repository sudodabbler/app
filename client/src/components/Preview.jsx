import React, { useRef, useState, useEffect, useCallback } from 'react';
import { fileUrl } from '../api.js';
import {
  clipDuration,
  fmtDuration,
  totalDuration,
  ASPECTS,
  CAPTION_FONTS,
  CAPTION_SIZE,
} from '../lib/clips.js';

// Poster image for a clip: the image itself, or a video's thumbnail.
function posterSrc(media) {
  if (!media) return null;
  return fileUrl(media.type === 'image' ? media.url || media.thumbnail : media.thumbnail);
}

function fitStyle(clip) {
  if (clip?.fit === 'reposition') {
    return {
      objectFit: 'cover',
      transform: `scale(${clip.scale || 1}) translate(${(clip.offsetX || 0) / 10}px, ${
        (clip.offsetY || 0) / 10
      }px)`,
    };
  }
  if (clip?.fit === 'blur') return { objectFit: 'contain' };
  return { objectFit: 'cover' };
}

/**
 * Rough in-browser preview: steps through the clip sequence, applying the
 * chosen fit, playing videos at their trim/speed, showing burned captions
 * (live as you type), and playing the selected audio snippet underneath.
 * The caption can be dragged to reposition, snapping to the horizontal centre.
 */
export default function Preview({
  clips,
  mediaById,
  beats,
  audioSelection,
  tracks,
  captionStyle = {},
  onCaptionStyleChange,
  selectedClip,
  aspectRatio = '9:16',
}) {
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [snapX, setSnapX] = useState(false);
  const [snapY, setSnapY] = useState(false);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const stageRef = useRef(null);

  const track = audioSelection ? tracks.find((t) => t.id === audioSelection.audioId) : null;
  const total = totalDuration(clips, mediaById);
  const { w, h } = ASPECTS[aspectRatio] || ASPECTS['9:16'];
  const portrait = h >= w;

  const captionColor = captionStyle.color || '#ffffff';
  const outline = captionStyle.outline !== false;
  const capX = typeof captionStyle.x === 'number' ? captionStyle.x : 0.5;
  const capY = typeof captionStyle.y === 'number' ? captionStyle.y : 0.78;
  const capFontFamily = (CAPTION_FONTS[captionStyle.font] || CAPTION_FONTS.classic).css;
  const capSizeFrac =
    typeof captionStyle.size === 'number' ? captionStyle.size : CAPTION_SIZE.default;
  // Scale caption size to the on-screen stage (frame-height fraction).
  const stageH = portrait ? 340 : Math.round((300 * h) / w);
  const capFontPx = Math.max(9, stageH * capSizeFrac);

  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
    setPlaying(false);
    setIndex(-1);
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
  }, []);

  const play = useCallback(() => {
    if (clips.length === 0) return;
    if (track && audioRef.current) {
      const a = audioRef.current;
      a.src = fileUrl(track.url);
      a.currentTime = audioSelection.in || 0;
      a.volume = Math.min(1, audioSelection.volume ?? 1);
      a.play().catch(() => {});
    }
    setPlaying(true);
    setIndex(0);
  }, [clips.length, track, audioSelection]);

  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips.length]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Drive playback.
  useEffect(() => {
    if (!playing || index < 0) return;
    const clip = clips[index];
    const media = clip ? mediaById.get(clip.mediaId) : null;
    if (!clip || !media) {
      stop();
      return;
    }
    const dur = clipDuration(clip, media);

    const v = videoRef.current;
    if (v) {
      if (media.type === 'video') {
        v.src = fileUrl(media.url);
        v.playbackRate = Math.min(2, Math.max(0.5, clip.speed || 1));
        try {
          v.currentTime = clip.trimIn || 0;
        } catch {}
        v.muted = !!track || audioSelection?.originalAudio === 'mute';
        v.play().catch(() => {
          v.muted = true;
          v.play().catch(() => {});
        });
      } else {
        v.pause();
      }
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (index + 1 < clips.length) setIndex(index + 1);
      else stop();
    }, dur * 1000);

    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index]);

  // Caption dragging → update normalized x/y, snapping x to centre.
  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      let x = (e.clientX - rect.left) / rect.width;
      let y = (e.clientY - rect.top) / rect.height;
      x = Math.max(0.05, Math.min(0.95, x));
      y = Math.max(0.05, Math.min(0.95, y));
      const nearX = Math.abs(x - 0.5) < 0.04;
      const nearY = Math.abs(y - 0.5) < 0.04;
      setSnapX(nearX);
      setSnapY(nearY);
      if (nearX) x = 0.5;
      if (nearY) y = 0.5;
      onCaptionStyleChange?.({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
    };
    const up = () => {
      setDragging(false);
      setSnapX(false);
      setSnapY(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [dragging, onCaptionStyleChange]);

  const clip = index >= 0 ? clips[index] : null;
  const media = clip ? mediaById.get(clip.mediaId) : null;
  const idlePoster = clips[0] ? mediaById.get(clips[0].mediaId) : null;

  const showVideo = playing && media?.type === 'video';
  const showImage = !showVideo && (media?.type === 'image' || (!playing && idlePoster));
  const imgMedia = media?.type === 'image' ? media : idlePoster;
  const blurMedia = clip?.fit === 'blur' ? media : null;

  // Which captions to show: during playback, the active clip's; when idle, the
  // selected clip's captions, or (so typing shows up live) all burn-in beats.
  const activeCaptions = (clip?.captionBeatIds || [])
    .map((id) => beats.find((b) => b.id === id))
    .filter((b) => b?.burn && b.text);
  const idleCaptions = (() => {
    if (selectedClip) {
      const att = (selectedClip.captionBeatIds || [])
        .map((id) => beats.find((b) => b.id === id))
        .filter((b) => b?.burn && b.text);
      if (att.length) return att;
    }
    return beats.filter((b) => b?.burn && b.text);
  })();
  const captions = playing ? activeCaptions : idleCaptions;

  const stageStyle = portrait
    ? { height: 340, aspectRatio: `${w} / ${h}` }
    : { width: 300, aspectRatio: `${w} / ${h}` };

  return (
    <div className="panel flex flex-col items-center">
      <div className="panel-title w-full flex items-center justify-between">
        <span>Preview</span>
        <span className="normal-case tracking-normal text-slate-500 tabular-nums">
          {aspectRatio} · {fmtDuration(total)}
        </span>
      </div>

      <div
        ref={stageRef}
        className="relative bg-black rounded-lg overflow-hidden mb-3 mx-3 shadow-lg"
        style={stageStyle}
      >
        {blurMedia?.thumbnail && (
          <img
            src={fileUrl(blurMedia.thumbnail)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-70"
          />
        )}

        <video
          ref={videoRef}
          playsInline
          className="absolute inset-0 w-full h-full"
          style={{ ...fitStyle(clip), display: showVideo ? 'block' : 'none' }}
        />

        {showImage && imgMedia && posterSrc(imgMedia) ? (
          <img
            src={posterSrc(imgMedia)}
            alt=""
            className="absolute inset-0 w-full h-full"
            style={fitStyle(clip || clips[0])}
          />
        ) : null}

        {!media && !idlePoster && (
          <div className="absolute inset-0 grid place-items-center text-slate-600 text-xs">
            Add clips to preview
          </div>
        )}

        {/* Safe-zone guide (bottom 15%, most relevant for 9:16) */}
        <div className="absolute inset-x-0 bottom-0 h-[15%] border-t border-dashed border-white/20 bg-black/10 pointer-events-none" />

        {/* Centre snap guides */}
        {dragging && snapX && (
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-brand-400/80 pointer-events-none" />
        )}
        {dragging && snapY && (
          <div className="absolute left-0 right-0 top-1/2 h-px bg-brand-400/80 pointer-events-none" />
        )}

        {/* Draggable captions */}
        {captions.length > 0 && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            title="Drag to reposition"
            className={`absolute px-2 select-none cursor-move ${
              dragging ? 'ring-1 ring-brand-400/60 rounded' : ''
            }`}
            style={{
              left: `${capX * 100}%`,
              top: `${capY * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: '92%',
              textAlign: 'center',
            }}
          >
            {captions.map((b) => (
              <p
                key={b.id}
                className="leading-tight"
                style={{
                  fontFamily: `'${capFontFamily}', sans-serif`,
                  fontSize: capFontPx,
                  whiteSpace: 'pre-line',
                  color: captionColor,
                  textShadow: outline
                    ? '0 0 3px #000, 1px 1px 2px #000, -1px -1px 2px #000'
                    : 'none',
                }}
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
        {playing ? (
          <span className="text-xs text-slate-400">
            Clip {index + 1}/{clips.length}
          </span>
        ) : (
          captions.length > 0 && (
            <span className="text-xs text-slate-500">Drag the caption to reposition</span>
          )
        )}
      </div>
    </div>
  );
}
