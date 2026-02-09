/** Write a string to a file using File System Access API */
export async function writeFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  content: string
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (err) {
    try { await writable.abort(); } catch { /* already closed */ }
    throw err;
  }
}

/** Read a file's text content from a directory handle */
export async function readFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string
): Promise<string | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

/** Check if File System Access API is available */
export function hasFileSystemAccess(): boolean {
  return 'showDirectoryPicker' in window;
}

/** Check if a file exists in a directory */
export async function fileExists(
  dirHandle: FileSystemDirectoryHandle,
  filename: string
): Promise<boolean> {
  try {
    await dirHandle.getFileHandle(filename);
    return true;
  } catch {
    return false;
  }
}

/** Find a safe filename that won't overwrite existing files */
export async function findSafeFilename(
  dirHandle: FileSystemDirectoryHandle,
  desiredName: string
): Promise<string> {
  if (!(await fileExists(dirHandle, desiredName))) return desiredName;

  const dotIndex = desiredName.lastIndexOf('.');
  const base = dotIndex > 0 ? desiredName.substring(0, dotIndex) : desiredName;
  const ext = dotIndex > 0 ? desiredName.substring(dotIndex) : '';

  // Try basename_dcal.ext first
  const dcalName = `${base}_dcal${ext}`;
  if (!(await fileExists(dirHandle, dcalName))) return dcalName;

  // Then basename_dcal_2.ext, _3, etc.
  for (let i = 2; i < 100; i++) {
    const numbered = `${base}_dcal_${i}${ext}`;
    if (!(await fileExists(dirHandle, numbered))) return numbered;
  }

  return `${base}_dcal_${Date.now()}${ext}`;
}

/** Trigger a file download as fallback */
export function downloadFile(filename: string, content: string, mimeType = 'application/xml'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
