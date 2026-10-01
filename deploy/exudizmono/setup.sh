#!/bin/bash
set -euo pipefail
cd /opt/frontrank/game
test ! -f .frontrank-patched
docker run --rm -v /opt/frontrank:/opt/frontrank -w /opt/frontrank/game node:24-slim node /opt/frontrank/deploy/patch-game.cjs
touch .frontrank-patched
cp /opt/frontrank/deploy/Dockerfile Dockerfile.frontrank
cp /opt/frontrank/deploy/api.mjs api.mjs
printf '\nproprietary\n.git\n.frontrank-patched\n' >> .dockerignore
mkdir -p /opt/frontrank/public /opt/frontrank/data /opt/frontrank/backups
cp /opt/frontrank/deploy/stats.html /opt/frontrank/public/stats.html
cp /opt/frontrank/deploy/compose.yaml /opt/frontrank/compose.yaml
if [ ! -f /opt/frontrank/runtime.env ]; then
 umask 077
 printf 'GAME_ENV=dev\nDOMAIN=77.68.55.16\nNUM_WORKERS=2\nINSTANCE_LETTER=a\nTURNSTILE_SITE_KEY=1x00000000000000000000AA\nSTANDALONE_API_URL=http://127.0.0.1:8787\nGIT_COMMIT=%s\nAPI_KEY=%s\n' "$(git rev-parse HEAD)" "$(openssl rand -hex 32)" > /opt/frontrank/runtime.env
fi
docker build -f Dockerfile.frontrank -t frontrank-game:test .
tar --exclude=.git --exclude=node_modules --exclude=static --exclude=proprietary --exclude=.env --exclude='.env.*' -czf /opt/frontrank/public/source.tar.gz .
cp /opt/frontrank/deploy/nginx.conf /etc/nginx/sites-available/frontrank
ln -sfn /etc/nginx/sites-available/frontrank /etc/nginx/sites-enabled/frontrank
if [ -L /etc/nginx/sites-enabled/default ]; then unlink /etc/nginx/sites-enabled/default; fi
nginx -t
ufw allow 22/tcp
ufw allow 80/tcp
ufw --force enable
cd /opt/frontrank
docker compose up -d
systemctl reload nginx
printf 'Deployment started.\n'
