from pathlib import Path
import json,re
root=Path('/opt/frontrank/game')
components=root/'src/client/components'
for name in ['DesktopNavBar.ts','MobileNavBar.ts','PlayPage.ts']:
 p=components/name;s=p.read_text()
 s=re.sub(r'<img\s+[^>]*src=\$\{assetUrl\("images/OpenFrontLogo.svg"\)\}[^>]*/>', '<a href="https://exudizmono.com/" class="text-white font-bold tracking-widest" style="font-size:clamp(17px,2vw,27px);text-decoration:none" aria-label="Exudizmono home">EXUDIZMONO</a>',s)
 if 'assetUrl(' not in s:s=re.sub(r'import \{ assetUrl \} from [^;]+;\n','',s)
 p.write_text(s)
(components/'Footer.ts').write_text('''import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { currentGameVersion } from "../GameVersion";
@customElement("page-footer")
export class Footer extends LitElement {
 createRenderRoot() { return this; }
 render() { return html`<footer class="[.in-game_&]:hidden bg-zinc-900/90 text-white/60 w-full relative py-5 text-center border-t border-white/10">
 <div class="flex items-center justify-center gap-5 flex-wrap px-5">
 <a href="https://exudizmono.com/">Exudizmono</a>
 <a href="/stats/">Leaderboard &amp; stats</a>
 <a href="https://github.com/Moonnooo/OpenFrontIO" target="_blank" rel="noopener noreferrer">GitHub</a>
 <a href="/credits/">Credits &amp; licences</a>
 <a href="/source.tar.gz">Download source</a>
 </div><p class="text-xs mt-3">Exudizmono · Independent community game · ${currentGameVersion()}</p>
 <p class="text-xs mt-1">Based on OpenFront · © OpenFront and Contributors · Exudizmono modifications.</p>
 <lang-selector class="absolute right-4 top-3"></lang-selector></footer>`; }
}
''')
for p in (root/'resources/lang').glob('*.json'):
 s=p.read_text();s=re.sub(r'("title"\s*:\s*)"OpenFront[^"\n]*"',r'\1"Exudizmono"',s)
 p.write_text(s)
p=root/'resources/manifest.json';m=json.loads(p.read_text());m['name']='Exudizmono';m['short_name']='Exudizmono';m['icons']=[{'src':'/images/Exudizmono.svg','sizes':'any','type':'image/svg+xml','purpose':'any'}];p.write_text(json.dumps(m,indent=2)+'\n')
(root/'resources/images/Exudizmono.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111827"/><path d="M17 16h31v8H26v6h19v8H26v6h22v8H17z" fill="#c7f66a"/></svg>')
p=root/'index.html';s=p.read_text().replace('OpenFront (ALPHA)','Exudizmono').replace('/images/Favicon.svg','/images/Exudizmono.svg');s=re.sub(r'<div style="position:fixed;bottom:0;left:0;z-index:9999[^>]*>Independent fork[\s\S]*?</div>','',s);p.write_text(s)
for path in ['src/client/ApiBase.ts','src/client/ClientEnv.ts']:
 p=root/path;s=p.read_text();s=s.replace('window.location.hostname === "77.68.55.16"','["77.68.55.16", "game.exudizmono.com"].includes(window.location.hostname)');s=s.replace('return "ws://" + window.location.host','return (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host');p.write_text(s)
print('Updated Exudizmono source branding and domain routing')
