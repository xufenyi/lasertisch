import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

function pythonJsonHandler(scriptName: string, arguments_: string[] = []) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.method !== 'POST') {
      next();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= 20 * 1024 * 1024) chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > 20 * 1024 * 1024) {
        response.statusCode = 413;
        response.end('Application request is too large');
        return;
      }
      const environmentRoot = path.join(repositoryRoot, '.venv');
      const pythonCandidates = process.platform === 'win32'
        ? [path.join(environmentRoot, 'python.exe'), path.join(environmentRoot, 'Scripts', 'python.exe')]
        : [path.join(environmentRoot, 'bin', 'python')];
      const pythonExecutable = process.env.LASERTISCH_PYTHON ??
        pythonCandidates.find((candidate) => existsSync(candidate)) ?? pythonCandidates[0];
      const script = path.join(repositoryRoot, 'backend', 'scripts', scriptName);
      const child = spawn(pythonExecutable, [script, ...arguments_], {
        cwd: repositoryRoot,
        env: { ...process.env, PYTHONUTF8: '1' },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let answered = false;
      const fail = (message: string) => {
        if (answered) return;
        answered = true;
        response.statusCode = 500;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ error: message }));
      };
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', (error) => fail(error.message));
      child.on('close', (code) => {
        if (answered) return;
        if (code !== 0) {
          fail(Buffer.concat(stderr).toString('utf8') || `Python exited with code ${code}`);
          return;
        }
        answered = true;
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(Buffer.concat(stdout));
      });
      child.stdin.end(Buffer.concat(chunks));
    });
  };
}

function pythonApplicationBridge(): Plugin {
  return {
    name: 'lasertisch-python-application-bridge',
    configureServer(server) {
      server.middlewares.use('/api/plan', pythonJsonHandler('plan_toolpaths_stdio.py'));
      server.middlewares.use('/api/export', pythonJsonHandler('export_device_stdio.py'));
      server.middlewares.use('/api/boolean', pythonJsonHandler('boolean_geometry_stdio.py'));
      server.middlewares.use('/api/fonts', pythonJsonHandler('text_stdio.py', ['fonts']));
      server.middlewares.use('/api/text-outline', pythonJsonHandler('text_stdio.py'));
    },
  };
}

export default defineConfig({
  plugins: [react(), pythonApplicationBridge()],
  server: {
    fs: {
      allow: [repositoryRoot],
    },
  },
  build: {
    outDir: 'web-dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
  },
});

