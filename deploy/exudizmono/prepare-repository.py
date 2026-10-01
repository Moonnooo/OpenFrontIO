from pathlib import Path
import shutil,subprocess,json,urllib.request
root=Path('/opt/frontrank');game=root/'game'
dest=game/'deploy/exudizmono';dest.mkdir(parents=True,exist_ok=True)
for p in (root/'deploy').iterdir():
 if p.is_file() and p.name not in ['ClientEnv.ts','jwt.ts']:shutil.copy2(p,dest/p.name)
for name in ['stats.html','credits.html']:shutil.copy2(root/'public'/name,dest/name)
p=game/'.gitignore';s=p.read_text();s+='\n# Independent deployment secrets and state\nruntime.env\nprivate/\ndata/\nbackups/\n.frontrank-patched\n';p.write_text(s)
p=game/'README.md';s=p.read_text();prefix='''# Exudizmono

Independent community game based on OpenFront, with our own guest sessions, VPS hosting and match statistics.

- Website: https://exudizmono.com/
- Play: https://game.exudizmono.com/
- Stats: https://game.exudizmono.com/stats/
- Development repository: https://github.com/Moonnooo/OpenFrontIO

Fork base: upstream commit e02eeba (1 October 2026). Changes are committed in this fork. Keep the upstream remote for deliberate updates; review and test upstream merges before deployment. The files in deploy/exudizmono document our independent backend and VPS setup. Runtime secrets, identities, private keys and match databases are excluded.

Recorded wins are not a skill rating. Ranked queues, recovery accounts and complete anti-cheat validation remain future work. Original copyright and licensing notices are preserved below and in LICENSE, LICENSE-ASSETS and the live credits page.

---

## Upstream project documentation

'''
if not s.startswith('# Exudizmono'):p.write_text(prefix+s)
req=urllib.request.Request('https://api.github.com/meta',headers={'User-Agent':'Exudizmono-deployment'})
meta=json.load(urllib.request.urlopen(req));(root/'private/github-known-hosts').write_text(''.join('github.com '+key+'\n' for key in meta['ssh_keys']))
subprocess.run(['git','remote','set-url','origin','git@github.com:Moonnooo/OpenFrontIO.git'],cwd=game,check=True)
subprocess.run(['git','config','core.sshCommand','ssh -i /opt/frontrank/private/github-deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/opt/frontrank/private/github-known-hosts'],cwd=game,check=True)
print('Prepared fork source, documentation and verified GitHub host keys')
