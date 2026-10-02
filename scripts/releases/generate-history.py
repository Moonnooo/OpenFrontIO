#!/usr/bin/env python3
"""Generate truthful, version-bounded notes. Run after committing a feature release.
Requires full upstream tags/history: git fetch upstream --tags; git fetch --unshallow upstream main (once).
Generated metadata-only commits are excluded from player-facing change history.
"""
import json, subprocess, urllib.request, re
from pathlib import Path
root=Path(__file__).resolve().parents[2]
def git(*args): return subprocess.check_output(['git','-C',str(root),*args],text=True).strip()
version=json.loads((root/'resources/fork-version.json').read_text())
base=version['upstreamCommit']
if git('rev-parse','--is-shallow-repository')!='false': raise SystemExit('Fetch full upstream history before generating notes')
releases=[]
for page in range(1,100):
    req=urllib.request.Request(f'https://api.github.com/repos/openfrontio/openfrontio/releases?per_page=100&page={page}',headers={'User-Agent':'Exudizmono-release-history'})
    batch=json.load(urllib.request.urlopen(req,timeout=30))
    if not batch: break
    releases += [r for r in batch if not r['draft']]
for r in releases:
    r['commit']=git('rev-parse','--verify',r['tag_name']+'^{commit}')
    r['included']=subprocess.run(['git','-C',str(root),'merge-base','--is-ancestor',r['commit'],base],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
included=[r for r in releases if r['included']]
if not included: raise SystemExit('No verifiable upstream release found')
latest=max(included,key=lambda r:r['published_at'])
# Preserve every published release through the latest included release, even
# releases from separate branches, clearly labelled as historical when applicable.
upstream=[]
for r in releases:
    if r['published_at']>latest['published_at']: continue
    status='Release tag is in this fork’s upstream ancestry.' if r['included'] else 'Historical release: this tag is on a separate branch and is not an ancestor of our main base.'
    body=r['body'] or 'No release notes were published for this release.'
    upstream.append({'id':r['tag_name'],'title':r['tag_name']+(' (prerelease)' if r['prerelease'] else ''),'markdown':f"# OpenFront {r['tag_name']}\n\nPublished {r['published_at'][:10]} (UTC). {status}\n\n[Official release]({r['html_url']}) · [Release source](https://github.com/openfrontio/openfrontio/commit/{r['commit']})\n\n"+body})
rows=git('log','--format=%H%x09%aI%x09%s',base+'..HEAD').splitlines()
groups={}
for row in rows:
    sha,date,title=row.split('\t',2)
    if title=='Refresh generated release history':continue
    try: own=json.loads(git('show',sha+':resources/fork-version.json'))['exudizmono']
    except subprocess.CalledProcessError: own='0.1.0'
    item=groups.setdefault(own,{'id':own,'title':'Exudizmono v'+own,'dates':[],'changes':[]})
    item['dates'].append(date[:10]); item['changes'].append(f'- {title}. [Change](https://github.com/Moonnooo/OpenFrontIO/commit/{sha})')
exudizmono=[]
for x in groups.values():
    dates=sorted(set(x['dates']));date=dates[0] if len(dates)==1 else dates[0]+' to '+dates[-1]
    exudizmono.append({'id':x['id'],'title':x['title'],'markdown':'## '+x['title']+'\n\n'+date+' (UTC)\n\n'+'\n'.join(x['changes'])})
description=git('describe','--tags','--abbrev=8',base)
intro=f"# Exudizmono release notes\n\nRunning Exudizmono **v{version['exudizmono']}**, based on OpenFront **{description}**. [Exact upstream source](https://github.com/openfrontio/openfrontio/commit/{base}).\n\nChoose OpenFront releases above for all {len(upstream)} published release notes through **{latest['tag_name']}**. This main snapshot also contains commits after that tag; it is not a later tagged release. Release-specific branches are labelled individually. No notes for newer versions are presented as installed.\n\nExudizmono changes below come from this fork’s actual commits. Dates are UTC.\n\n"
summary=intro+'\n\n'.join(x['markdown'] for x in exudizmono)
catalog={'summary':summary,'exudizmono':exudizmono,'upstream':upstream,'upstreamCommit':base,'latestAncestorRelease':latest['tag_name']}
(root/'resources/release-history.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
(root/'resources/changelog.md').write_text(summary+'\n')
print(f"Generated {len(upstream)} official releases through {latest['tag_name']} and {len(exudizmono)} Exudizmono versions")
