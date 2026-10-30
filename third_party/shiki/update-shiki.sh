#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Clone dart-syntax-highlight repository to fetch the latest Dart TextMate grammar
git clone --depth 1 https://github.com/dart-lang/dart-syntax-highlight "$TEMP_DIR/dart-syntax-highlight"

mkdir -p "$SCRIPT_DIR/grammars"
cp "$TEMP_DIR/dart-syntax-highlight/grammars/dart.json" "$SCRIPT_DIR/grammars/dart.json"

cd "$TEMP_DIR/dart-syntax-highlight"
git show --summary | grep commit | head -1 > "$SCRIPT_DIR/grammars/last-updated.txt"
date -u +"%Y-%m-%dT%H:%M:%SZ" >> "$SCRIPT_DIR/grammars/last-updated.txt"

cd "$SCRIPT_DIR"
npm install
npm run build
