// Production build: compiles JSX in src/**/*.js to plain JS using esbuild,
// then assembles a self-contained dist/ folder for GitHub Pages.
//
// Modes:
//   node build.mjs                       — one-shot prod build (working Supabase)
//   node build.mjs --watch               — watch + serve dev (working Supabase)
//   node build.mjs --target=demo         — one-shot prod build (demo Supabase)
//   node build.mjs --target=demo --watch — watch + serve dev (demo Supabase)
//
// The --target flag selects which Supabase project the built bundle talks
// to. The supabase-client.js source carries placeholder strings (@@SUPABASE_URL@@,
// @@SUPABASE_KEY@@); we replace them per target right before esbuild
// transpiles the file. Anything else in src/ is left alone.

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

// ----- Supabase target config -----
// Add new targets here. Each entry must carry { url, key, label }. The
// label is only used for the build banner so the developer can see at
// a glance which project the bundle is pointing at.
const TARGETS = {
  working: {
    label: 'VARS - PMC (working / production)',
    url:   'https://khhguxuxvkxvycndkron.supabase.co',
    key:   'sb_publishable_JFWXeWDyB2_-po46Qyu6rA_HH7Uueyj',
  },
  demo: {
    label: 'VARS - PMC Demo (prospect playground)',
    url:   'https://ftcdcyigzownsabzqsoi.supabase.co',
    key:   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0Y2RjeWlnem93bnNhYnpxc29pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMjg0NDksImV4cCI6MjA5NTcwNDQ0OX0.PhhsACa9ninyZE0K_ghdIgvp1-XemGVgyzZ2-Zmsd9g',
  },
};
const TARGET_KEY = (() => {
  const arg = process.argv.find(a => a.startsWith('--target='));
  if (!arg) return 'working';
  const v = arg.split('=')[1];
  if (!TARGETS[v]) {
    console.error('Unknown --target=' + v + '. Known: ' + Object.keys(TARGETS).join(', '));
    process.exit(1);
  }
  return v;
})();
const TARGET = TARGETS[TARGET_KEY];
// File-path → placeholder map. Only the supabase client needs swaps today,
// but keeping the lookup table here means adding more later is one line.
const PLACEHOLDER_REPLACEMENTS = {
  'src/lib/supabase-client.js': [
    [/@@SUPABASE_URL@@/g, TARGET.url],
    [/@@SUPABASE_KEY@@/g, TARGET.key],
  ],
};

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
    let source = await fs.readFile(file, 'utf8');
    // Apply per-target placeholder swaps before transpilation. The file's
    // own IIFE-with-startsWith check makes unreplaced placeholders fall
    // back to the working project, so dev mode (no build step) still works.
    const norm = file.split(path.sep).join('/');
    const repls = PLACEHOLDER_REPLACEMENTS[norm];
    if (repls) {
      for (const [pat, val] of repls) source = source.replace(pat, val);
    }
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
  console.log('Supabase target: ' + TARGET_KEY + ' (' + TARGET.label + ')');
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
