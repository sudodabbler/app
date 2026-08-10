import React, { useRef, useEffect, useState } from 'react';

/**
 * Canvas waveform with draggable in/out handles. `peaks` is a 0..1 array.
 * in/out/duration are in seconds. Calls onChange({ in, out }) while dragging.
 * `playhead` (seconds) draws a live cursor during preview/playback.
 */
export default function Waveform({ peaks = [], duration = 0, inPoint = 0, outPoint = 0, playhead = null, onChange, onScrub }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [drag, setDrag] = useState(null); // 'in' | 'out' | null
  const [w, setW] = useState(600);
  const H = 88;

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(200, e.contentRect.width));
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);

    const mid = H / 2;
    const inX = duration ? (inPoint / duration) * w : 0;
    const outX = duration ? (outPoint / duration) * w : w;

    // Bars
    const n = peaks.length || 1;
    const barW = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * barW;
      const inSel = x >= inX && x <= outX;
      const h = (peaks[i] || 0) * (H * 0.9);
      ctx.fillStyle = inSel ? '#ec4899' : '#3a445c';
      ctx.fillRect(x, mid - h / 2, Math.max(1, barW - 0.5), h);
    }
    if (peaks.length === 0) {
      ctx.fillStyle = '#3a445c';
      ctx.fillRect(0, mid - 1, w, 2);
    }

    // Selection borders
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 2;
    [inX, outX].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    });

    // Playhead
    if (playhead != null && duration) {
      const px = (playhead / duration) * w;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
    }
  }, [peaks, duration, inPoint, outPoint, w, playhead]);

  function xToTime(clientX) {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return (x / rect.width) * duration;
  }

  function onDown(e) {
    if (!duration) return;
    const t = xToTime(e.clientX);
    const inX = (inPoint / duration) * w;
    const outX = (outPoint / duration) * w;
    const px = (t / duration) * w;
    // Grab nearest handle within 12px, else scrub.
    if (Math.abs(px - inX) < 12) setDrag('in');
    else if (Math.abs(px - outX) < 12) setDrag('out');
    else {
      onScrub?.(t);
      setDrag('scrub');
    }
  }

  useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      const t = xToTime(e.clientX);
      if (drag === 'in') onChange?.({ in: Math.min(t, outPoint - 0.1), out: outPoint });
      else if (drag === 'out') onChange?.({ in: inPoint, out: Math.max(t, inPoint + 0.1) });
      else if (drag === 'scrub') onScrub?.(t);
    };
    const up = () => setDrag(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [drag, inPoint, outPoint, duration, w]);

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        onMouseDown={onDown}
        style={{ width: '100%', height: H }}
        className="rounded-md bg-ink-900 cursor-ew-resize select-none"
      />
    </div>
  );
}
