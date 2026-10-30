// Copyright (c) 2026, the Dart project authors.  Please see the AUTHORS file
// for details. All rights reserved. Use of this source code is governed by a
// BSD-style license that can be found in the LICENSE file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'resources');
const langsDir = path.join(outDir, 'langs');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(langsDir, { recursive: true });

// Copy CSS
fs.copyFileSync(
  path.join(__dirname, 'src', 'shiki.css'),
  path.join(outDir, 'shiki.css'),
);

// Build main Shiki client bundle
await esbuild.build({
  entryPoints: [path.join(__dirname, 'src', 'init.mjs')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(outDir, 'shiki.js'),
  legalComments: 'none',
  banner: {
    js: '/*! Shiki (MIT) + dart-syntax-highlight (BSD-3-Clause) - see /third_party/shiki/LICENSE */',
  },
});

// Emit minified secondary language JSON grammars for lazy loading
const lazyLangModules = [
  ['c', '@shikijs/langs/c'],
  ['css', '@shikijs/langs/css'],
  ['groovy', '@shikijs/langs/groovy'],
  ['html', '@shikijs/langs/html'],
  ['java', '@shikijs/langs/java'],
  ['javascript', '@shikijs/langs/javascript'],
  ['kotlin', '@shikijs/langs/kotlin'],
  ['markdown', '@shikijs/langs/markdown'],
  ['objective-c', '@shikijs/langs/objc'],
  ['sql', '@shikijs/langs/sql'],
  ['swift', '@shikijs/langs/swift'],
  ['toml', '@shikijs/langs/toml'],
  ['typescript', '@shikijs/langs/typescript'],
  ['xml', '@shikijs/langs/xml'],
];

for (const [canonicalName, specifier] of lazyLangModules) {
  const mod = await import(specifier);
  fs.writeFileSync(
    path.join(langsDir, `${canonicalName}.json`),
    JSON.stringify(mod.default),
  );
}

console.log('Built third_party/shiki/resources successfully.');
