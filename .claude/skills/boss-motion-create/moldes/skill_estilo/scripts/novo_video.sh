#!/bin/bash
# Cria a pasta de um vídeo novo neste estilo: copia o projeto (sem node_modules) e liga os atalhos de node_modules e venv.
#   bash novo_video.sh "<Nome do vídeo>" [pasta onde criar]
set -e
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
NOME="$1"; [ -n "$NOME" ] || { echo 'uso: novo_video.sh "<Nome do vídeo>" [pasta]'; exit 1; }
[ -d "$SKILL/projeto/node_modules" ] || bash "$SKILL/instalar.sh"
DESTINO="${2:-${BOSS_ESTILOS:-$HOME/BossEstilos}/{{NOME_CURTO}}/videos}"
mkdir -p "$DESTINO"
N=$(ls "$DESTINO" 2>/dev/null | grep -Eo '^[0-9]{3}' | sort -n | tail -1); N=$(printf "%03d" $((10#${N:-0} + 1)))
P="$DESTINO/$N - $NOME"
mkdir -p "$P"
if command -v rsync >/dev/null; then
  rsync -a --exclude node_modules --exclude venv --exclude out --exclude '._*' "$SKILL/projeto/" "$P/"
else   # sem rsync (nuvem): mesma cópia com tar
  (cd "$SKILL/projeto" && tar -cf - --exclude ./node_modules --exclude ./venv --exclude ./out --exclude '._*' .) | (cd "$P" && tar -xf -)
fi
ln -s "$SKILL/projeto/node_modules" "$P/node_modules"
ln -s "$SKILL/projeto/venv" "$P/venv"
echo "$P"
