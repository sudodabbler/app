/**
 * Public URLs for stored files. The server mounts the projects directory at
 * `/files`, so a media file at data/projects/<id>/media/<name> is reachable
 * at /files/<id>/media/<name>. Front-end prefixes these with the API origin.
 */
export function mediaUrl(projectId, filename) {
  return `/files/${projectId}/media/${encodeURIComponent(filename)}`;
}
export function thumbUrl(projectId, filename) {
  return filename ? `/files/${projectId}/thumbnails/${encodeURIComponent(filename)}` : null;
}
export function audioUrl(projectId, filename) {
  return `/files/${projectId}/audio/${encodeURIComponent(filename)}`;
}
export function renderUrl(projectId, filename) {
  return `/files/${projectId}/renders/${encodeURIComponent(filename)}`;
}
