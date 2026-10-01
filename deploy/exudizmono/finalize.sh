#!/bin/bash
set -euo pipefail
cd /opt/frontrank
docker cp frontrank-game-1:/app/static/index.html public/game-index.html
docker run --rm -v /opt/frontrank:/deploy -w /deploy frontrank-game:standalone node deploy/sanitize.cjs public/game-index.html game/index.html
mkdir -p backups
chmod 700 backups
python3 deploy/backup.py
cp data/signing-key.json backups/signing-key.json
chmod 600 backups/signing-key.json
printf '23 3 * * * root /usr/bin/python3 /opt/frontrank/deploy/backup.py\n' > /etc/cron.d/frontrank-backup
tar --exclude=.git --exclude=node_modules --exclude=static --exclude=proprietary --exclude=.env -czf public/source.tar.gz -C /opt/frontrank game deploy
docker compose up -d
