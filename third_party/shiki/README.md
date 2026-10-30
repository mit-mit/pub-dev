# Shiki Syntax Highlighter

Client-side syntax highlighting bundle powered by [Shiki](https://shiki.style/)
(JavaScript RegExp engine, no WASM required) and the official Dart TextMate
grammar from [`dart-lang/dart-syntax-highlight`](https://github.com/dart-lang/dart-syntax-highlight).

- **Shiki License:** https://github.com/shikijs/shiki/blob/main/LICENSE
- **Dart Grammar License:** https://github.com/dart-lang/dart-syntax-highlight/blob/master/LICENSE

## Architecture

- `grammars/dart.json`: Dart TextMate grammar synced from `dart-lang/dart-syntax-highlight`.
- `src/init.mjs`: Fine-grained Shiki browser entrypoint:
  - Uses `github-light-default` and `github-dark-default` dual themes via CSS custom properties (`--shiki-light` / `--shiki-dark`), adjusted so all token colors meet WCAG 2.1 AA contrast (`>= 4.5:1`) against pub.dev's light and dark code block backgrounds.
  - Bundles common package languages (`dart`, `shellscript`/`bash`/`sh`/`shell`/`zsh`, `yaml`, `json`, `diff`) inline for synchronous zero-waterfall highlighting.
  - Lazily fetches secondary language grammars (`c`, `css`, `groovy`, `html`, `java`, `javascript`, `kotlin`, `markdown`, `objective-c`, `sql`, `swift`, `toml`, `typescript`, `xml`) from `resources/langs/*.json` only when referenced on the page.
- `resources/`: Pre-built static assets served under `/static/shiki/resources/`.

## Updating

To pull the latest Dart TextMate grammar and rebuild `resources/`:

```bash
./update-shiki.sh
```

To rebuild `resources/` locally without fetching upstream changes:

```bash
npm install
npm run build
```
