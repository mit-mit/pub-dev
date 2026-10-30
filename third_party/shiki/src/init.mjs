// Copyright (c) 2026, the Dart project authors.  Please see the AUTHORS file
// for details. All rights reserved. Use of this source code is governed by a
// BSD-style license that can be found in the LICENSE file.

import {
  codeToTokens,
  createShikiInternalSync,
  stringifyTokenStyle,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubDarkDefault from '@shikijs/themes/github-dark-default';
import githubLightDefault from '@shikijs/themes/github-light-default';
import diff from '@shikijs/langs/diff';
import json from '@shikijs/langs/json';
import shellscript from '@shikijs/langs/shellscript';
import yaml from '@shikijs/langs/yaml';
import dartGrammarRaw from '../grammars/dart.json';

// Capture script URL synchronously during initial script evaluation so lazy
// grammar chunks resolve under the same `/static/hash-<etag>/shiki/resources/` base.
const currentScriptSrc =
  typeof document !== 'undefined' && document.currentScript
    ? document.currentScript.src
    : '';

const LIGHT_THEME = 'github-light-default';
const DARK_THEME = 'github-dark-default';

const COLOR_REPLACEMENTS = {
  [LIGHT_THEME]: {
    // Adjust GitHub light comment foreground (#6e7781 -> #57606a) to guarantee
    // WCAG 2.1 AA contrast (5.87:1 >= 4.5:1) on pub.dev's #f5f5f7 code background.
    '#6e7781': '#57606a',
  },
};

const CORE_GRAMMARS = {
  dart: [{ ...dartGrammarRaw, name: 'dart' }],
  diff,
  json,
  shellscript,
  yaml,
};

const LAZY_LANGS = new Set([
  'c',
  'css',
  'groovy',
  'html',
  'java',
  'javascript',
  'kotlin',
  'markdown',
  'objective-c',
  'sql',
  'swift',
  'toml',
  'typescript',
  'xml',
]);

const LANG_ALIASES = {
  // Core bundled languages
  dart: 'dart',
  shellscript: 'shellscript',
  bash: 'shellscript',
  sh: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  console: 'shellscript',
  yaml: 'yaml',
  yml: 'yaml',
  json: 'json',
  jsonc: 'json',
  arb: 'json',
  diff: 'diff',
  patch: 'diff',

  // Lazy-loaded secondary languages
  c: 'c',
  h: 'c',
  cpp: 'c',
  'c++': 'c',
  cc: 'c',
  hpp: 'c',
  css: 'css',
  groovy: 'groovy',
  gradle: 'groovy',
  html: 'html',
  htm: 'html',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  kotlin: 'kotlin',
  kt: 'kotlin',
  kts: 'kotlin',
  markdown: 'markdown',
  md: 'markdown',
  'objective-c': 'objective-c',
  objc: 'objective-c',
  objectivec: 'objective-c',
  m: 'objective-c',
  mm: 'objective-c',
  sql: 'sql',
  swift: 'swift',
  toml: 'toml',
  typescript: 'typescript',
  ts: 'typescript',
  xml: 'xml',
  plist: 'xml',
  svg: 'xml',
  xhtml: 'xml',
};

const LANGUAGE_RE = /\blang(?:uage)?-([\w+-]+)\b/i;

function detectLanguage(preEl, codeEl) {
  const cls = `${codeEl.className || ''} ${preEl.className || ''}`;
  const match = LANGUAGE_RE.exec(cls);
  if (!match) return null;
  return LANG_ALIASES[match[1].toLowerCase()] || null;
}

/**
 * Extracts plain text and any `<strong>` / `<b>` character ranges (used e.g. on
 * the Installing tab). Returns `null` if the block contains other HTML elements
 * (such as `<a>`), preserving interactive markup untouched.
 */
function extractCodeAndBoldRanges(codeEl) {
  const boldRanges = [];
  let text = '';

  function walk(node, inBold) {
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      const val = node.nodeValue || '';
      if (inBold && val.length > 0) {
        boldRanges.push([text.length, text.length + val.length]);
      }
      text += val;
      return true;
    }
    if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const tag = node.tagName;
      if (tag !== 'STRONG' && tag !== 'B') {
        return false;
      }
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (!walk(child, true)) return false;
      }
      return true;
    }
    return true;
  }

  for (let child = codeEl.firstChild; child; child = child.nextSibling) {
    if (!walk(child, false)) return null;
  }
  return { text, boldRanges };
}

function appendTokenContent(span, content, tokenStart, boldRanges) {
  if (boldRanges.length === 0) {
    span.textContent = content;
    return;
  }
  const tokenEnd = tokenStart + content.length;
  let pos = 0;
  for (let i = 0; i < boldRanges.length; i++) {
    const [bStart, bEnd] = boldRanges[i];
    if (bEnd <= tokenStart || bStart >= tokenEnd) continue;
    const s = Math.max(0, bStart - tokenStart);
    const e = Math.min(content.length, bEnd - tokenStart);
    if (s > pos) {
      span.appendChild(document.createTextNode(content.slice(pos, s)));
    }
    if (e > s) {
      const strong = document.createElement('strong');
      strong.textContent = content.slice(s, e);
      span.appendChild(strong);
    }
    pos = e;
  }
  if (pos === 0) {
    span.textContent = content;
  } else if (pos < content.length) {
    span.appendChild(document.createTextNode(content.slice(pos)));
  }
}

function highlightBlock(shiki, preEl, codeEl, canonicalLang) {
  if (codeEl.dataset.highlighted) return;
  const extracted = extractCodeAndBoldRanges(codeEl);
  if (!extracted) return;

  const rawText = extracted.text;
  const code = rawText.endsWith('\r\n')
    ? rawText.slice(0, -2)
    : rawText.endsWith('\n')
      ? rawText.slice(0, -1)
      : rawText;

  const result = codeToTokens(shiki, code, {
    lang: canonicalLang,
    themes: {
      light: LIGHT_THEME,
      dark: DARK_THEME,
    },
    defaultColor: false,
    colorReplacements: COLOR_REPLACEMENTS,
  });

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < result.tokens.length; i++) {
    if (i > 0) {
      fragment.appendChild(document.createTextNode('\n'));
    }
    const lineSpan = document.createElement('span');
    lineSpan.className = 'line';
    const lineTokens = result.tokens[i];
    for (let j = 0; j < lineTokens.length; j++) {
      const token = lineTokens[j];
      const tokenSpan = document.createElement('span');
      if (token.htmlStyle) {
        const styleStr = stringifyTokenStyle(token.htmlStyle);
        if (styleStr) {
          tokenSpan.setAttribute('style', styleStr);
        }
      }
      appendTokenContent(
        tokenSpan,
        token.content,
        token.offset,
        extracted.boldRanges,
      );
      lineSpan.appendChild(tokenSpan);
    }
    fragment.appendChild(lineSpan);
  }

  preEl.classList.add('shiki');
  codeEl.replaceChildren(fragment);
  codeEl.dataset.highlighted = 'yes';
}

let shikiInstance = null;
const loadedCoreLangs = new Set();

function getShiki(neededCoreLangs) {
  const grammarsToLoad = [];
  for (const lang of neededCoreLangs) {
    if (!loadedCoreLangs.has(lang) && CORE_GRAMMARS[lang]) {
      loadedCoreLangs.add(lang);
      grammarsToLoad.push(...CORE_GRAMMARS[lang]);
    }
  }
  if (!shikiInstance) {
    shikiInstance = createShikiInternalSync({
      themes: [githubLightDefault, githubDarkDefault],
      langs: grammarsToLoad,
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  } else if (grammarsToLoad.length > 0) {
    shikiInstance.loadLanguageSync(grammarsToLoad);
  }
  return shikiInstance;
}

function highlightAll() {
  const codeElements = document.querySelectorAll('pre code');
  if (codeElements.length === 0) return;

  const coreBlocks = [];
  const neededCoreLangs = new Set();
  const lazyBlocksByLang = new Map();

  for (let i = 0; i < codeElements.length; i++) {
    const codeEl = codeElements[i];
    if (codeEl.dataset.highlighted) continue;
    const preEl = codeEl.parentElement;
    if (!preEl || preEl.tagName !== 'PRE') continue;

    const lang = detectLanguage(preEl, codeEl);
    if (!lang) continue;

    if (CORE_GRAMMARS[lang]) {
      neededCoreLangs.add(lang);
      coreBlocks.push({ preEl, codeEl, lang });
    } else if (LAZY_LANGS.has(lang)) {
      let list = lazyBlocksByLang.get(lang);
      if (!list) {
        list = [];
        lazyBlocksByLang.set(lang, list);
      }
      list.push({ preEl, codeEl, lang });
    }
  }

  if (coreBlocks.length === 0 && lazyBlocksByLang.size === 0) return;

  const shiki = getShiki(neededCoreLangs);
  for (let i = 0; i < coreBlocks.length; i++) {
    const { preEl, codeEl, lang } = coreBlocks[i];
    highlightBlock(shiki, preEl, codeEl, lang);
  }

  if (lazyBlocksByLang.size > 0 && currentScriptSrc) {
    const langsBaseUrl = new URL('./langs/', currentScriptSrc);
    for (const [lang, blocks] of lazyBlocksByLang.entries()) {
      const url = new URL(`${lang}.json`, langsBaseUrl).toString();
      fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .then((grammars) => {
          if (!grammars) return;
          shiki.loadLanguageSync(grammars);
          for (let i = 0; i < blocks.length; i++) {
            highlightBlock(shiki, blocks[i].preEl, blocks[i].codeEl, lang);
          }
        })
        .catch(() => {
          // Leave block as readable plain text if network fetch fails.
        });
    }
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', highlightAll, { once: true });
  } else {
    highlightAll();
  }
}
