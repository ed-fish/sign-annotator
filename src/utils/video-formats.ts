const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv', '.m4v',
]);

export function isVideoFile(filename: string): boolean {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

export function getBaseName(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.substring(0, dotIndex) : filename;
}

export function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.substring(dotIndex).toLowerCase() : '';
}
