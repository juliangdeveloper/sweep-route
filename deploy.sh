#!/usr/bin/env bash
# Deploy de Sweep Route: bumpea la version del badge, commitea, pushea y verifica Pages.
# Uso:  ./deploy.sh "descripcion del cambio" [patch|minor|major]
#       (patch por defecto: v1.3.0 -> v1.3.1 ; minor: v1.3.0 -> v1.4.0)
set -e
cd "$(dirname "$0")"

MSG="${1:-cambios}"
BUMP="${2:-patch}"

V=$(grep -o 'id="verBadge">v[0-9.]*' index.html | grep -o '[0-9.]*')
[ -z "$V" ] && { echo "no encuentro el badge de version en index.html"; exit 1; }
IFS='.' read -r A B C <<< "$V"
case "$BUMP" in
  major) A=$((A+1)); B=0; C=0;;
  minor) B=$((B+1)); C=0;;
  *)     C=$((C+1));;
esac
NV="$A.$B.$C"

sed -i "s/id=\"verBadge\">v[0-9.]*/id=\"verBadge\">v$NV/" index.html
git add -A
git -c user.name="Julian" -c user.email="julpinesco@gmail.com" commit -m "v$NV: $MSG" >/dev/null || { echo "nada que commitear"; exit 0; }

TOK=$(printf 'protocol=https\nhost=github.com\nusername=juliangdeveloper\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')
[ -z "$TOK" ] && { echo "no hay token en el almacen de credenciales"; exit 1; }
git push -q "https://juliangdeveloper:$TOK@github.com/juliangdeveloper/sweep-route.git" master:master
echo "v$NV pusheado. Esperando build de Pages..."

sleep 40
for i in 1 2 3 4 5 6; do
  if curl -s "https://juliangdeveloper.github.io/sweep-route/" | grep -q "verBadge\">v$NV"; then
    echo "OK: v$NV en produccion -> https://juliangdeveloper.github.io/sweep-route/"
    exit 0
  fi
  sleep 15
done
echo "AVISO: el build tarda mas de lo esperado; revisa en un minuto."
