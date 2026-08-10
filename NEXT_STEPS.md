# Next steps

Planned work, captured so it's not lost between sessions. Pick up here.

## Caption / text improvements (requested)

### 1. Live caption preview while typing
As the user types in the **Script / Copy** panel, show the text in the preview
stage in **real time** — before it's attached to a clip and without pressing
Play. Likely approach:
- Add a "live/edit" caption overlay in `Preview.jsx` that renders the beat
  currently being edited (or all burn-in beats) on top of the idle poster.
- Consider a small toggle: "show captions on preview" so it can be turned off.
- Keep using `.font-caption` + `captionStyle.color` so it matches the render.

### 2. Draggable caption positioning + snap-to-center
Let the user **drag the caption** around the preview to reposition it, with a
**snap to horizontal center** (and maybe vertical thirds / safe-zone line).
- Store position as a normalized offset, e.g. `captionStyle.x` (0..1) and
  `captionStyle.y` (0..1), defaulting to centered / y≈0.70.
- Preview: absolutely position the caption box from those values; while
  dragging, snap x to 0.5 when within a few % ; show a faint center guide.
- Render (`services/render.js` drawtext): replace the fixed
  `x=(w-text_w)/2:y=h*0.70` with values derived from the stored offsets
  (e.g. `x=(w-text_w)*X : y=h*Y`). Keep it safe-zone aware.
- Decide scope: per-project caption position (simpler) vs per-beat (flexible).
  Per-project is probably enough to start.

### 3. Outline (border) on/off toggle
Add a control (next to the caption color picker) to switch the caption
**border/outline on or off** (and maybe a "shadow only" middle option).
- Store `captionStyle.outline: boolean` (default true).
- Preview: toggle the `textShadow` / outline styling.
- Render: when off, set `borderw=0` in the drawtext filter (maybe keep a soft
  `shadowcolor`/`shadowx/y` for legibility); when on, keep `borderw=4:bordercolor=black`.

## Implementation notes
- Caption style already lives in `project.script.captionStyle` (currently just
  `{ color }`) — extend that object with `x`, `y`, `outline`.
- Preview caption rendering is in `client/src/components/Preview.jsx`.
- Script panel caption controls are in `client/src/components/ScriptPanel.jsx`.
- Burn-in drawtext is in `server/src/services/render.js` (`encodeSegment`).
- Everything autosaves through the `output`/`script` slices in `App.jsx`.
