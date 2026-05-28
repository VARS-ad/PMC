// Production build: compiles JSX in src/**/*.js to plain JS using esbuild,
// then assembles a self-contained dist/ folder for GitHub Pages.
//
// Local dev is unchanged — opening index.html directly still uses babel-
// standalone to transpile JSX in the browser. This script is for CI only.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const SRC_DIR = 'src';
const DIST_DIR = 'dist';
const INDEX_HTML = 'index.html';

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function main() {
  // 1. Clean and recreate dist/
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  // 2. Walk src/ and transform each .js (JSX) or copy assets
  const files = await walk(SRC_DIR);
  let transformed = 0;
  let copied = 0;
  for (const file of files) {
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
        minify: true,
      });
      await fs.writeFile(out, result.code);
      transformed++;
    } else {
      // CSS, fonts, images — copy unchanged
      await fs.copyFile(file, out);
      copied++;
    }
  }

  // 3. Rewrite index.html: drop babel-standalone, strip type="text/babel"
  // so the browser executes the already-transpiled JS directly.
  let html = await fs.readFile(INDEX_HTML, 'utf8');
  html = html
    .replace(/^\s*<script src="[^"]*babel-standalone[^"]*"><\/script>\s*\n?/m, '')
    .replace(/\stype="text\/babel"/g, '');
  await fs.writeFile(path.join(DIST_DIR, INDEX_HTML), html);

  console.log(`Built: ${transformed} JS files transpiled, ${copied} assets copied.`);
  console.log(`Output: ${DIST_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
