import React, { useRef, useState, useEffect, useCallback } from 'react';
import { fileUrl } from '../api.js';
import { clipDuration, fmtDuration, totalDuration, ASPECTS } from '../lib/clips.js';

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
 * chosen fit, playing videos at their trim/speed, showing burned captions,
 * and playing the selected audio snippet underneath. An approximation of the
 * final render, not a frame-accurate match.
 */
export default function Preview({
  clips,
  mediaById,
  beats,
  audioSelection,
  tracks,
  captionColor = '#ffffff',
  aspectRatio = '9:16',
}) {
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const timerRef = useRef(null);

  const track = audioSelection ? tracks.find((t) => t.id === audioSelection.audioId) : null;
  const total = totalDuration(clips, mediaById);
  const { w, h } = ASPECTS[aspectRatio] || ASPECTS['9:16'];
  const portrait = h >= w;

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

  // Stop if the sequence changes length mid-play.
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips.length]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Drive playback: whenever the active index changes, show the clip, start
  // any video, and schedule the advance to the next clip.
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
        // If a music track is playing, mute the clip so it doesn't clash;
        // otherwise try with sound, falling back to muted if autoplay is blocked.
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

  const clip = index >= 0 ? clips[index] : null;
  const media = clip ? mediaById.get(clip.mediaId) : null;
  const idlePoster = clips[0] ? mediaById.get(clips[0].mediaId) : null;

  const showVideo = playing && media?.type === 'video';
  const showImage = !showVideo && (media?.type === 'image' || (!playing && idlePoster));
  const imgMedia = media?.type === 'image' ? media : idlePoster;
  const blurMedia = clip?.fit === 'blur' ? media : null;

  const activeCaptions = (clip?.captionBeatIds || [])
    .map((id) => beats.find((b) => b.id === id))
    .filter((b) => b?.burn && b.text);

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
        className="relative bg-black rounded-lg overflow-hidden mb-3 mx-3 shadow-lg"
        style={stageStyle}
      >
        {/* Blur background layer */}
        {blurMedia?.thumbnail && (
          <img
            src={fileUrl(blurMedia.thumbnail)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-70"
          />
        )}

        {/* Video layer (always mounted; shown only while playing a video clip) */}
        <video
          ref={videoRef}
          playsInline
          className="absolute inset-0 w-full h-full"
          style={{ ...fitStyle(clip), display: showVideo ? 'block' : 'none' }}
        />

        {/* Image layer */}
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

        {/* Burned captions */}
        {activeCaptions.length > 0 && (
          <div className="absolute inset-x-2 bottom-[18%] text-center pointer-events-none">
            {activeCaptions.map((b) => (
              <p
                key={b.id}
                className="font-caption text-[13px] font-bold leading-tight"
                style={{
                  color: captionColor,
                  textShadow: '0 0 3px #000, 1px 1px 2px #000, -1px -1px 2px #000',
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
        {playing && (
          <span className="text-xs text-slate-400">
            Clip {index + 1}/{clips.length}
          </span>
        )}
      </div>
    </div>
  );
}
