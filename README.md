# ClipStitch

Create short-form vertical (TikTok-style) videos from Pinterest media and custom
audio. Import images/videos from public Pinterest boards or pins (or drag-and-drop
your own), arrange them on a timeline with per-clip crop/trim/speed/transitions,
lay a trimmed audio snippet underneath with fades, burn in captions, and render a
polished **1080×1920 · 30fps · H.264/AAC MP4**.

This is a **full-stack** app — Pinterest fetching and video rendering happen on a
Node backend that shells out to `ffmpeg` and `gallery-dl`. It cannot run purely in
the browser.

---

## Architecture

```
clipstitch/
├── server/                 # Node + Express API, job queue, ffmpeg render pipeline
│   └── src/
│       ├── index.js        # app entry, routes, static serving, /api/health
│       ├── config.js       # paths + tunables (env-overridable)
│       ├── lib/            # db (JSON project store), queue, proc, urls
│       ├── routes/         # projects, media, pinterest, audio, render, jobs
│       └── services/       # media (probe/thumb), audio, pinterest, render
├── client/                 # React + Vite + Tailwind editor UI
│   └── src/
│       ├── App.jsx         # state, autosave, layout
│       ├── api.js          # fetch client + job polling
│       ├── lib/clips.js    # clip duration/format helpers
│       └── components/     # MediaLibrary, Timeline, ClipInspector,
│                           #   ScriptPanel, AudioPanel, Waveform, Preview, RenderPanel
└── data/                   # created at runtime: projects/<id>/{media,audio,renders,...}
```

- **Storage:** local disk under `data/` for the MVP; the file layout is served at
  `/files/...` and is straightforward to swap for S3 later.
- **Jobs:** a small in-process serial queue runs Pinterest fetches and renders;
  the UI polls `GET /api/jobs/:id` for progress. Swap for BullMQ without changing
  the API surface.
- **Persistence:** one atomic `project.json` per project; the timeline autosaves
  ~0.7s after edits.

---

## Prerequisites

- **Node.js ≥ 20**
- **ffmpeg** and **ffprobe** on `PATH` — required for rendering, thumbnails,
  audio extraction, and waveforms.
  - macOS: `brew install ffmpeg`
  - Debian/Ubuntu: `sudo apt-get install ffmpeg`
  - Caption burn-in uses the `drawtext` filter (needs a build with
    `libfreetype`). Most distro/Homebrew builds include it; some minimal static
    builds don't. If it's missing, renders still succeed and captions are skipped
    with a warning.
- **gallery-dl** on `PATH` — required only for Pinterest import (direct upload
  works without it).
  - `pipx install gallery-dl` (or `pip install gallery-dl`)

The app **degrades gracefully** when these are absent: `GET /api/health` reports
capabilities, the UI shows which features are available, and unavailable actions
return clear errors instead of crashing.

---

## Quick start (development)

```bash
npm install                 # installs root + server + client workspaces
npm run dev                 # server on :4000, client on :5173 (with API proxy)
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/files` to the
backend, so the frontend uses same-origin URLs.

Run pieces individually:

```bash
npm run dev:server
npm run dev:client
```

## Production (single service)

Build the client and let the server serve it from the same origin:

```bash
npm run build               # outputs client/dist
npm start                   # server serves API + built client on :4000
```

Then open http://localhost:4000.

Configuration is via environment variables — see [`.env.example`](./.env.example).

---

## How it works

### 1. Import media
Paste public Pinterest board/pin URLs (comma- or newline-separated) and click
**Import from Pinterest**. The backend runs `gallery-dl` (capped at 100 items),
imports each file into the library with a thumbnail, and records per-URL status
(`fetched` / `failed`). Or drag-and-drop / **Upload** images and videos directly.

### 2. Timeline
Drag media into the timeline (double-click also appends). Click a clip to open
**Clip settings**: image display duration or video in/out trim, speed (0.5–2×),
fit to 9:16 (**center-crop**, **blur background**, **reposition**), and the
transition to the next clip (**cut** or **crossfade**). Reorder by dragging;
duplicate/delete with the hover controls. The header shows total sequence duration
against a 15/30/60s target.

### 3. Script & captions
Type your script — each line becomes a numbered beat. Toggle a beat between
**burn-in** and **reference only**, then drag it onto a clip (or attach it from the
Clip settings panel). Burned captions render bottom-center, white with a black
outline, above TikTok's bottom-15% UI safe zone.

### 4. Audio
Upload MP3/WAV/M4A — or a MOV/MP4 to extract its audio track. Drag the waveform
handles to select a snippet, set volume + fade-in/out, choose whether original
clip audio is **kept / ducked (~20%) / muted**, and toggle **loop** vs. trim
behavior when the snippet is shorter than the video. Tap beat markers while it
plays to help align cuts.

### 5. Preview & render
Use **Play preview** for a rough in-browser approximation. Hit **Render video**:
the backend cuts each clip to a normalized intermediate (1080×1920, 30fps, H.264,
yuv420p, AAC), then concatenates them (concat demuxer for cuts; an
`xfade`/`acrossfade` chain when crossfades are present), mixes the audio snippet
with fades, and writes an MP4. The last 10 renders per project are kept with
download links.

> **Render design:** per-clip normalized intermediates → concat/xfade, rather than
> one giant `filter_complex` over raw sources. This handles mixed resolutions,
> frame rates, and codecs far more reliably.

---

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Capabilities (ffmpeg/ffprobe/gallery-dl) + limits |
| `GET/POST` | `/api/projects` | List / create projects |
| `GET/PUT/DELETE` | `/api/projects/:id` | Read / autosave / delete |
| `GET` | `/api/projects/:id/media` | List media |
| `POST` | `/api/projects/:id/media/upload` | Upload files (`files[]`) |
| `POST` | `/api/projects/:id/media/pinterest` | Start Pinterest fetch job (`{urls}`) |
| `DELETE` | `/api/projects/:id/media/:mediaId` | Remove media |
| `POST` | `/api/projects/:id/audio/upload` | Upload audio (`file`) → track + waveform |
| `DELETE` | `/api/projects/:id/audio/:audioId` | Remove track |
| `POST` | `/api/projects/:id/render` | Start render job |
| `GET` | `/api/projects/:id/renders` | Render history |
| `GET` | `/api/jobs/:jobId` | Poll job status/progress |

---

## Edge cases handled

- Vertical vs. horizontal sources auto-fit to 9:16 via the chosen strategy.
- Mixed frame rates/codecs normalized in the per-clip intermediate step.
- Audio snippet shorter than the video: **loop** or **fade out early** (toggle).
- Large boards capped at 100 items; failed/ private/ dead links surface per-item.
- Missing `ffmpeg` / `gallery-dl` / `drawtext`: features disable with clear
  messaging instead of failing hard.

## Notes / not included (MVP)

- No authentication or payments (single-user).
- In-process job queue and local-disk storage (S3-ready interfaces, not wired).
