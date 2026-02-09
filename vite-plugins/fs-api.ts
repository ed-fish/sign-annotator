import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv', '.m4v']);

function isVideoFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

function parseJsonBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body) as Record<string, string>); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

export function fsApiPlugin(): Plugin {
  return {
    name: 'dcal-fs-api',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? '';

        // POST /api/scan-path
        if (req.method === 'POST' && url === '/api/scan-path') {
          void (async () => {
            try {
              const { dirPath } = await parseJsonBody(req);
              if (!dirPath || !fs.existsSync(dirPath)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Directory not found' }));
                return;
              }
              const stat = fs.statSync(dirPath);
              if (!stat.isDirectory()) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Path is not a directory' }));
                return;
              }

              const entries = fs.readdirSync(dirPath);
              const videos: { name: string; path: string; size: number }[] = [];
              const eafFiles: { name: string; path: string }[] = [];

              for (const entry of entries) {
                const fullPath = path.join(dirPath, entry);
                try {
                  const entryStat = fs.statSync(fullPath);
                  if (!entryStat.isFile()) continue;
                  if (isVideoFile(entry)) {
                    videos.push({ name: entry, path: fullPath, size: entryStat.size });
                  } else if (entry.endsWith('.eaf')) {
                    eafFiles.push({ name: entry, path: fullPath });
                  }
                } catch {
                  // skip unreadable entries
                }
              }

              videos.sort((a, b) => a.name.localeCompare(b.name));
              const folderName = path.basename(dirPath);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ folderName, videos, eafFiles }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: (err as Error).message }));
            }
          })();
          return;
        }

        // POST /api/read-file
        if (req.method === 'POST' && url === '/api/read-file') {
          void (async () => {
            try {
              const { filePath } = await parseJsonBody(req);
              if (!filePath || !fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found' }));
                return;
              }
              const content = fs.readFileSync(filePath, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'text/plain' });
              res.end(content);
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: (err as Error).message }));
            }
          })();
          return;
        }

        // POST /api/write-file
        if (req.method === 'POST' && url === '/api/write-file') {
          void (async () => {
            try {
              const { filePath, content } = await parseJsonBody(req);
              if (!filePath) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'filePath required' }));
                return;
              }
              const dir = path.dirname(filePath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              fs.writeFileSync(filePath, content, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: (err as Error).message }));
            }
          })();
          return;
        }

        // GET /api/serve-video?path=...
        if (req.method === 'GET' && url.startsWith('/api/serve-video')) {
          try {
            const parsed = new URL(url, 'http://localhost');
            const videoPath = parsed.searchParams.get('path');
            if (!videoPath || !fs.existsSync(videoPath)) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Video not found' }));
              return;
            }

            const ext = path.extname(videoPath).toLowerCase();
            const needsRemux = ext === '.mov' || ext === '.avi' || ext === '.mkv';

            // For MOV/AVI/MKV: remux to MP4 via ffmpeg (container copy, no re-encoding)
            if (needsRemux) {
              const ffmpeg = spawn('ffmpeg', [
                '-i', videoPath,
                '-c', 'copy',
                '-movflags', 'frag_keyframe+empty_moov+faststart',
                '-f', 'mp4',
                'pipe:1',
              ], { stdio: ['ignore', 'pipe', 'ignore'] });

              res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Transfer-Encoding': 'chunked',
              });

              ffmpeg.stdout.pipe(res);

              ffmpeg.on('error', () => {
                if (!res.headersSent) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'ffmpeg not available' }));
                } else {
                  res.end();
                }
              });

              res.on('close', () => {
                ffmpeg.kill('SIGTERM');
              });

              return;
            }

            // For browser-native formats: serve directly with range support
            const stat = fs.statSync(videoPath);
            const fileSize = stat.size;
            const mimeMap: Record<string, string> = {
              '.mp4': 'video/mp4',
              '.webm': 'video/webm',
              '.ogg': 'video/ogg',
              '.ogv': 'video/ogg',
              '.m4v': 'video/mp4',
            };
            const contentType = mimeMap[ext] ?? 'video/mp4';

            const range = req.headers.range;
            if (range) {
              const parts = range.replace(/bytes=/, '').split('-');
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
              const chunkSize = end - start + 1;
              const stream = fs.createReadStream(videoPath, { start, end });
              res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType,
              });
              stream.pipe(res);
            } else {
              res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
              });
              fs.createReadStream(videoPath).pipe(res);
            }
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
          return;
        }

        next();
      });
    },
  };
}
