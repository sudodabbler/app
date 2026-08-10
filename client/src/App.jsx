import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api } from './api.js';
import { makeClip, totalDuration } from './lib/clips.js';
import TopBar from './components/TopBar.jsx';
import MediaLibrary from './components/MediaLibrary.jsx';
import Timeline from './components/Timeline.jsx';
import ClipInspector from './components/ClipInspector.jsx';
import ScriptPanel from './components/ScriptPanel.jsx';
import AudioPanel from './components/AudioPanel.jsx';
import Preview from './components/Preview.jsx';
import RenderPanel from './components/RenderPanel.jsx';

const LAST_KEY = 'clipstitch.lastProjectId';

function editableSignature(p) {
  if (!p) return '';
  return JSON.stringify({
    name: p.name,
    script: p.script,
    timeline: p.timeline,
    selection: p.audio?.selection,
    output: p.output,
  });
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [loading, setLoading] = useState(true);

  const lastSavedSig = useRef('');
  const saveTimer = useRef(null);

  // ---- bootstrap ----
  useEffect(() => {
    (async () => {
      try {
        const [h, list] = await Promise.all([api.health().catch(() => null), api.listProjects()]);
        setHealth(h);
        setProjects(list);
        const wanted = localStorage.getItem(LAST_KEY);
        const pick = list.find((p) => p.id === wanted) || list[0];
        if (pick) await openProject(pick.id);
        else await createProject('My first video');
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshProjectsList() {
    setProjects(await api.listProjects());
  }

  const openProject = useCallback(async (id) => {
    const full = await api.getProject(id);
    setProject(full);
    setSelectedClipId(null);
    lastSavedSig.current = editableSignature(full);
    localStorage.setItem(LAST_KEY, id);
  }, []);

  async function createProject(name) {
    const p = await api.createProject(name || 'Untitled project');
    await refreshProjectsList();
    await openProject(p.id);
  }

  // ---- autosave editable slices ----
  const sig = editableSignature(project);
  useEffect(() => {
    if (!project) return;
    if (sig === lastSavedSig.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.saveProject(project.id, {
          name: project.name,
          script: project.script,
          timeline: project.timeline,
          audio: { selection: project.audio?.selection ?? null },
          output: project.output ?? { aspectRatio: '9:16' },
        });
        lastSavedSig.current = sig;
        // keep the switcher's names/counts fresh
        refreshProjectsList().catch(() => {});
      } catch (e) {
        console.error('autosave failed', e);
      }
    }, 700);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // ---- editable updaters ----
  const patch = useCallback((updater) => {
    setProject((p) => (p ? { ...p, ...updater(p) } : p));
  }, []);

  const setClips = useCallback(
    (fn) => {
      patch((p) => ({
        timeline: { ...p.timeline, clips: fn(p.timeline.clips) },
      }));
    },
    [patch],
  );

  const setSelection = useCallback(
    (sel) => patch((p) => ({ audio: { ...p.audio, selection: sel } })),
    [patch],
  );

  // ---- media/audio/render refresh (server-owned slices) ----
  const reloadMedia = useCallback(async () => {
    if (!project) return;
    const media = await api.listMedia(project.id);
    setProject((p) => (p ? { ...p, media } : p));
  }, [project]);

  const reloadTracks = useCallback(async () => {
    if (!project) return;
    const full = await api.getProject(project.id);
    setProject((p) => (p ? { ...p, audio: { ...p.audio, tracks: full.audio.tracks } } : p));
  }, [project]);

  const reloadRenders = useCallback(async () => {
    if (!project) return;
    const renders = await api.listRenders(project.id);
    setProject((p) => (p ? { ...p, renders } : p));
  }, [project]);

  // ---- timeline ops ----
  const mediaById = useMemo(
    () => new Map((project?.media || []).map((m) => [m.id, m])),
    [project?.media],
  );

  function addMediaToTimeline(mediaId, index = null) {
    const media = mediaById.get(mediaId);
    if (!media || media.status === 'failed') return;
    const clip = makeClip(media);
    setClips((clips) => {
      const next = [...clips];
      const at = index == null || index > next.length ? next.length : index;
      next.splice(at, 0, clip);
      return next;
    });
    setSelectedClipId(clip.id);
  }

  function reorderClip(from, to) {
    setClips((clips) => {
      if (from === to) return clips;
      const next = [...clips];
      const [moved] = next.splice(from, 1);
      const dest = from < to ? to - 1 : to;
      next.splice(Math.max(0, Math.min(next.length, dest)), 0, moved);
      return next;
    });
  }

  function updateClip(updated) {
    setClips((clips) => clips.map((c) => (c.id === updated.id ? updated : c)));
  }

  function duplicateClip(id) {
    setClips((clips) => {
      const i = clips.findIndex((c) => c.id === id);
      if (i < 0) return clips;
      const copy = { ...clips[i], id: makeClip({ id: 'x', type: clips[i].type }).id };
      const next = [...clips];
      next.splice(i + 1, 0, copy);
      return next;
    });
  }

  function deleteClip(id) {
    setClips((clips) => clips.filter((c) => c.id !== id));
    if (selectedClipId === id) setSelectedClipId(null);
  }

  function toggleTransition(id) {
    setClips((clips) =>
      clips.map((c) => {
        if (c.id !== id) return c;
        const type = c.transition?.type === 'crossfade' ? 'cut' : 'crossfade';
        return { ...c, transition: { ...c.transition, type, duration: c.transition?.duration || 0.3 } };
      }),
    );
  }

  function assignBeatToClip(beatId, clipId) {
    setClips((clips) =>
      clips.map((c) => {
        if (c.id !== clipId) return c;
        const ids = new Set(c.captionBeatIds || []);
        ids.add(beatId);
        return { ...c, captionBeatIds: [...ids] };
      }),
    );
  }

  // ---- project management ----
  async function handleNew() {
    const name = window.prompt('New project name', 'Untitled video');
    if (name !== null) await createProject(name || 'Untitled video');
  }
  async function handleRename() {
    const name = window.prompt('Rename project', project.name);
    if (name) patch(() => ({ name }));
  }
  async function handleDelete() {
    if (!window.confirm(`Delete project "${project.name}"? This removes its media and renders.`))
      return;
    await api.deleteProject(project.id);
    localStorage.removeItem(LAST_KEY);
    const list = await api.listProjects();
    setProjects(list);
    if (list[0]) await openProject(list[0].id);
    else await createProject('My first video');
  }

  const selectedClip = project?.timeline.clips.find((c) => c.id === selectedClipId) || null;
  const totalSec = project ? totalDuration(project.timeline.clips, mediaById) : 0;

  if (loading) {
    return (
      <div className="h-full grid place-items-center text-slate-500">Loading ClipStitch…</div>
    );
  }

  if (!project) {
    return (
      <div className="h-full grid place-items-center">
        <button className="btn" onClick={() => createProject('My first video')}>
          Create a project
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        health={health}
        projects={projects}
        currentId={project.id}
        onSelect={openProject}
        onNew={handleNew}
        onRename={handleRename}
        onDelete={handleDelete}
        project={project}
        totalSec={totalSec}
      />

      <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_360px] gap-3 p-3">
        {/* Left: media library */}
        <div className="min-h-0">
          <MediaLibrary
            project={project}
            health={health}
            onMediaChanged={reloadMedia}
            onAddToTimeline={(m) => addMediaToTimeline(m.id)}
          />
        </div>

        {/* Center: preview + inspector + timeline */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
          <div className="flex gap-3 min-h-0 flex-1 overflow-hidden">
            <Preview
              clips={project.timeline.clips}
              mediaById={mediaById}
              beats={project.script.beats || []}
              audioSelection={project.audio?.selection}
              tracks={project.audio?.tracks || []}
              captionColor={project.script.captionStyle?.color || '#ffffff'}
              aspectRatio={project.output?.aspectRatio || '9:16'}
            />
            <div className="flex-1 min-h-0 overflow-y-auto">
              {selectedClip ? (
                <ClipInspector
                  clip={selectedClip}
                  media={mediaById.get(selectedClip.mediaId)}
                  beats={project.script.beats || []}
                  aspectRatio={project.output?.aspectRatio || '9:16'}
                  onChange={updateClip}
                  onClose={() => setSelectedClipId(null)}
                />
              ) : (
                <div className="panel h-full grid place-items-center text-center text-sm text-slate-500 p-6">
                  <div>
                    <p className="mb-1 text-slate-400">Select a clip to edit it</p>
                    <p className="text-xs">
                      Drag media into the timeline below, then click a clip to set duration, crop,
                      speed, transitions and captions.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Timeline
            clips={project.timeline.clips}
            mediaById={mediaById}
            selectedClipId={selectedClipId}
            onSelect={setSelectedClipId}
            onReorder={reorderClip}
            onAddMedia={addMediaToTimeline}
            onAssignBeat={assignBeatToClip}
            onDuplicate={duplicateClip}
            onDelete={deleteClip}
            onToggleTransition={toggleTransition}
            targetDuration={project.timeline.targetDuration || 30}
            onTargetChange={(t) =>
              patch((p) => ({ timeline: { ...p.timeline, targetDuration: t } }))
            }
            totalSec={totalSec}
          />
        </div>

        {/* Right: script + audio + render */}
        <div className="min-h-0 overflow-y-auto flex flex-col gap-3">
          <ScriptPanel
            script={project.script}
            onChange={(script) => patch(() => ({ script }))}
            selectedClip={selectedClip}
            onAssignBeat={(beatId) => selectedClip && assignBeatToClip(beatId, selectedClip.id)}
          />
          <AudioPanel
            project={project}
            selection={project.audio?.selection}
            onSelectionChange={setSelection}
            onTracksChanged={reloadTracks}
          />
          <RenderPanel
            project={project}
            health={health}
            onRendersChanged={reloadRenders}
            canRender={project.timeline.clips.length > 0}
            aspectRatio={project.output?.aspectRatio || '9:16'}
            onAspectChange={(aspectRatio) =>
              patch((p) => ({ output: { ...p.output, aspectRatio } }))
            }
          />
        </div>
      </div>
    </div>
  );
}
