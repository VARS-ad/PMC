// Production build: compiles JSX in src/**/*.js to plain JS using esbuild,
// then assembles a self-contained dist/ folder for GitHub Pages.
//
// Two modes:
//   node build.mjs            — one-shot prod build into dist/
//   node build.mjs --watch    — keep dist/ in sync as src/ changes AND
//                               serve it on http://localhost:8080. Open
//                               that URL instead of index.html directly
//                               so the browser runs the pre-compiled
//                               files and skips the ~700KB babel-
//                               standalone transpile on every reload.

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import * as esbuild from 'esbuild';

const SRC_DIR = 'src';
const DIST_DIR = 'dist';
const INDEX_HTML = 'index.html';
const WATCH = process.argv.includes('--watch');
const SERVE_PORT = 8080;

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function transpileFile(file, { minify }) {
  const out = path.join(DIST_DIR, file);
  await fs.mkdir(path.dirname(out), { recursive: true });
  if (file.endsWith('.js')) {
    const source = await fs.readFile(file, 'utf8');
    const result = await esbuild.transform(source, {
      loader: 'jsx',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: 'es2020',
      // Watch mode skips minification — faster rebuilds, readable stack
      // traces in devtools. Prod build still minifies.
      minify,
    });
    await fs.writeFile(out, result.code);
    return 'js';
  }
  await fs.copyFile(file, out);
  return 'asset';
}

async function rebuildHtml() {
  let html = await fs.readFile(INDEX_HTML, 'utf8');
  html = html
    .replace(/^\s*<script src="[^"]*babel-standalone[^"]*"><\/script>\s*\n?/m, '')
    .replace(/\stype="text\/babel"/g, '');
  await fs.writeFile(path.join(DIST_DIR, INDEX_HTML), html);
}

async function fullBuild({ minify }) {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });
  const files = await walk(SRC_DIR);
  let transformed = 0;
  let copied = 0;
  for (const file of files) {
    const kind = await transpileFile(file, { minify });
    if (kind === 'js') transformed++; else copied++;
  }
  await rebuildHtml();
  return { transformed, copied };
}

function startWatcher() {
  // Coalesce rapid editor saves (Excel-like multi-write bursts) so we don't
  // re-transpile the same file three times in 50ms.
  const pending = new Map();
  const schedule = (file) => {
    if (pending.has(file)) clearTimeout(pending.get(file));
    pending.set(file, setTimeout(async () => {
      pending.delete(file);
      try {
        if (!fsSync.existsSync(file)) {
          // Source removed → drop the dist copy.
          const out = path.join(DIST_DIR, file);
          await fs.rm(out, { force: true });
          console.log('removed', file);
          return;
        }
        await transpileFile(file, { minify: false });
        console.log('rebuilt', file);
      } catch (e) {
        console.error('build failed for', file, '-', e.message);
      }
    }, 80));
  };
  fsSync.watch(SRC_DIR, { recursive: true }, (_evt, filename) => {
    if (!filename) return;
    schedule(path.join(SRC_DIR, filename));
  });
  fsSync.watch(INDEX_HTML, async () => {
    try { await rebuildHtml(); console.log('rebuilt index.html'); }
    catch (e) { console.error('html rebuild failed -', e.message); }
  });
}

function startDevServer() {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
  };
  const server = http.createServer(async (req, res) => {
    try {
      const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
      const full = path.join(DIST_DIR, rel);
      // Crude path-traversal guard.
      if (!full.startsWith(path.resolve(DIST_DIR))) { res.statusCode = 403; return res.end('forbidden'); }
      const buf = await fs.readFile(full);
      res.setHeader('Content-Type', MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
      // Disable caching so reloads always pick up the watcher's fresh output.
      res.setHeader('Cache-Control', 'no-store');
      res.end(buf);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  server.listen(SERVE_PORT, () => {
    console.log('Dev server: http://localhost:' + SERVE_PORT + '  (serving ' + DIST_DIR + '/)');
  });
}

async function main() {
  if (WATCH) {
    const { transformed, copied } = await fullBuild({ minify: false });
    console.log('Initial build: ' + transformed + ' JS, ' + copied + ' assets.');
    startWatcher();
    startDevServer();
    console.log('Watching src/ and index.html for changes — Ctrl+C to stop.');
    return;
  }
  const { transformed, copied } = await fullBuild({ minify: true });
  console.log('Built: ' + transformed + ' JS files transpiled, ' + copied + ' assets copied.');
  console.log('Output: ' + DIST_DIR + '/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
