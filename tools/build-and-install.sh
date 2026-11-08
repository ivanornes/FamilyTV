#!/usr/bin/env bash
# Empaqueta y instala Casa TV en el televisor.
# Uso: ./tools/build-and-install.sh <IP_DEL_TV> [perfil_de_certificado]
#
# Requisitos: Tizen Studio con la extensión TV, y un perfil de certificado
# Samsung creado en el Certificate Manager con el DUID de tu tele (ver README).
set -euo pipefail

TV_IP="${1:?Uso: $0 <IP_DEL_TV> [perfil]}"
PROFILE="${2:-casatv}"
TIZEN_HOME="${TIZEN_HOME:-$HOME/tizen-studio}"
TIZEN="$TIZEN_HOME/tools/ide/bin/tizen"
SDB="$TIZEN_HOME/tools/sdb"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/.build"

rm -rf "$BUILD" && mkdir -p "$BUILD"
# Sólo lo que va en el paquete (sin tools/, README, etc.)
cp -R "$ROOT/config.xml" "$ROOT/index.html" "$ROOT/icon.png" "$ROOT/css" "$ROOT/js" "$ROOT/img" "$ROOT/fonts" "$BUILD/"

echo "→ Conectando con $TV_IP"
"$SDB" connect "$TV_IP"
TARGET="$("$SDB" devices | awk -v ip="$TV_IP" 'index($1, ip) {print $3; exit}')"
[ -n "$TARGET" ] || { echo "No veo el TV en 'sdb devices'. ¿Modo desarrollador con la IP de este Mac?"; exit 1; }

echo "→ Empaquetando con el perfil '$PROFILE'"
"$TIZEN" package -t wgt -s "$PROFILE" -- "$BUILD"

echo "→ Instalando en $TARGET"
"$TIZEN" install -n "$(ls "$BUILD"/*.wgt | head -1 | xargs basename)" -t "$TARGET" -- "$BUILD"

echo "→ Lanzando"
"$TIZEN" run -p CasaTV0001.CasaTV -t "$TARGET" || true
echo "✓ Listo"
