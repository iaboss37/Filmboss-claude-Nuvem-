#!/bin/bash
# Instala o que o estilo precisa (uma vez por computador): pacotes do Remotion e o python do borrão e da conferência de fidelidade.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
cd "$AQUI/projeto"
command -v node >/dev/null || { echo "Falta o Node 18 ou mais novo (https://nodejs.org)"; exit 1; }
command -v ffmpeg >/dev/null || { echo "Falta o ffmpeg (no Mac: brew install ffmpeg)"; exit 1; }
command -v python3 >/dev/null || { echo "Falta o python3"; exit 1; }
[ -d node_modules ] || npm install --no-audit --no-fund
if [ ! -x venv/bin/python ]; then
  python3 -m venv venv
  venv/bin/pip install -q numpy opencv-python-headless scipy scikit-learn librosa soundfile pillow
fi
# leitor de texto da conferência (Vision no Mac, Tesseract no Linux); sem ele a conferência pula a parte do texto
if [ "$(uname)" = "Darwin" ]; then
  if command -v swiftc >/dev/null && [ ! -x "$AQUI/scripts/bin/textos" ]; then
    swiftc -O "$AQUI/scripts/bin/textos.swift" -o "$AQUI/scripts/bin/textos" 2>/dev/null || true
  fi
elif ! command -v tesseract >/dev/null && command -v apt-get >/dev/null; then
  SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo"
  { $SUDO apt-get update -qq && $SUDO apt-get install -y -qq tesseract-ocr tesseract-ocr-por; } >/dev/null 2>&1 || true
fi
echo "ok: estilo instalado em $AQUI"
