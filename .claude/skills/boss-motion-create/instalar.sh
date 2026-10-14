#!/bin/bash
# Instala o motor da boss-motion-create (uma vez por computador): python com as bibliotecas da análise, leitor de texto
# e a base do Remotion compartilhada pelos estudos. Tudo fica em ~/FilmbossTools/boss-motion (ou em $BOSS_MOTION_BASE).
# Funciona no Mac do Rick e na nuvem (Claude Code na web, Linux). Na nuvem a máquina é nova a cada sessão: rode de novo.
set -e
SKILL="$(cd "$(dirname "$0")" && pwd)"
BASE="${BOSS_MOTION_BASE:-$HOME/FilmbossTools/boss-motion}"
mkdir -p "$BASE/projetos" "$BASE/base"
PY=/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13
[ -x "$PY" ] || PY=python3
if [ ! -x "$BASE/venv/bin/python" ]; then
  "$PY" -m venv "$BASE/venv"
  "$BASE/venv/bin/pip" install -q numpy opencv-python-headless scipy scikit-learn librosa soundfile pillow fonttools
fi
if [ "$(uname)" = "Darwin" ]; then
  # leitor de texto com o Vision do Mac
  [ -x "$SKILL/scripts/bin/textos" ] || swiftc -O "$SKILL/scripts/bin/textos.swift" -o "$SKILL/scripts/bin/textos"
else
  # Linux (nuvem): leitor de texto com o Tesseract; yt-dlp no venv para referência por link
  if ! command -v tesseract >/dev/null && command -v apt-get >/dev/null; then
    SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo"
    $SUDO apt-get update -qq >/dev/null 2>&1 || true
    $SUDO apt-get install -y -qq tesseract-ocr tesseract-ocr-por >/dev/null 2>&1 || echo "aviso: não consegui instalar o tesseract (a análise segue sem ler os textos)"
  fi
  command -v yt-dlp >/dev/null || [ -x "$BASE/venv/bin/yt-dlp" ] || "$BASE/venv/bin/pip" install -q yt-dlp || true
fi
cp "$SKILL/moldes/remotion/package.json" "$BASE/base/package.json"
(cd "$BASE/base" && [ -d node_modules ] || npm install --no-audit --no-fund)
command -v ffmpeg >/dev/null || echo "aviso: falta o ffmpeg"
command -v yt-dlp >/dev/null || [ -x "$BASE/venv/bin/yt-dlp" ] || echo "aviso: falta o yt-dlp (só para referência por link)"
command -v tesseract >/dev/null || [ "$(uname)" = "Darwin" ] || echo "aviso: falta o tesseract (a análise segue sem ler os textos)"
command -v trash >/dev/null || [ "$(uname)" != "Darwin" ] || echo "aviso: falta o trash (gerar_skill --forcar usa)"
echo "ok: boss-motion-create instalada em $BASE"
