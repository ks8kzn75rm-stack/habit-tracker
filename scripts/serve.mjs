#!/usr/bin/env node
/**
 * Tiny static file server for local development and tests.
 *
 *   node scripts/serve.mjs [--port 8080] [--base /habit-tracker/] [--root .]
 *
 * By default it serves the repo under /habit-tracker/ so relative paths behave
 * exactly as they will on GitHub Pages. Like GitHub Pages it sends ETags and a
 * 10 minute max-age, which lets tests prove that updates still get through
 * HTTP caching.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

export function createStaticServer({ root, base = '/habit-tracker/', maxAge = 600 } = {}) {
  const rootDir = path.resolve(root);
  const basePath = `/${base.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }

    if (basePath !== '/' && pathname === basePath.slice(0, -1)) {
      res.writeHead(301, { Location: basePath }).end();
      return;
    }
    if (!pathname.startsWith(basePath) || pathname.includes('/.')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    let rel = pathname.slice(basePath.length);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.join(rootDir, rel);
    if (!file.startsWith(rootDir + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let data;
    try {
      data = await fs.readFile(file);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    const etag = `"${createHash('sha1').update(data).digest('hex')}"`;
    const headers = {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': `max-age=${maxAge}`,
      ETag: etag,
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(arg('port', 8080));
  const base = arg('base', '/habit-tracker/');
  const root = arg('root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  createStaticServer({ root, base }).listen(port, () => {
    console.log(`Serving ${path.resolve(root)} at http://localhost:${port}${base}`);
  });
}
