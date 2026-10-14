#!/bin/bash
# Instala o motor do Afinador Boss neste Mac (uma vez): copia os scripts para ~/FilmbossTools/afinador-boss
# e cria o Python dele (torch, torchcrepe, librosa, Praat e Demucs). Precisa de internet; leva uns 5 minutos.
set -e
SKILL="$(cd "$(dirname "$0")" && pwd)"
BASE="$HOME/FilmbossTools/afinador-boss"
mkdir -p "$BASE"
for f in "$SKILL"/scripts/*; do
  alvo="$BASE/$(basename "$f")"
  # só copia se faltar ou se o pacote for mais novo (não pisa em código mexido aqui)
  if [ ! -f "$alvo" ] || [ "$f" -nt "$alvo" ]; then cp -X "$f" "$alvo"; fi
done
PY=""
for c in /Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13 /opt/homebrew/bin/python3.13 \
         /opt/homebrew/bin/python3.12 python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    PY="$c"; break
  fi
done
if [ -z "$PY" ]; then
  echo "erro: precisa do Python 3.10 ou mais novo (baixe em python.org) e rode de novo"
  exit 1
fi
[ -x "$BASE/venv/bin/python" ] || "$PY" -m venv "$BASE/venv"
"$BASE/venv/bin/pip" install -q --upgrade pip
"$BASE/venv/bin/pip" install -q -r "$BASE/requirements.txt"
"$BASE/venv/bin/python" -c "import torch, torchcrepe, parselmouth, librosa, demucs, soundfile"
echo "ok: Afinador Boss instalado em $BASE"
