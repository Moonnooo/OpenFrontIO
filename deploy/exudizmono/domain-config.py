from pathlib import Path
root=Path('/opt/frontrank')
p=root/'deploy/api.mjs';s=p.read_text().replace("req.headers.origin!=='http://77.68.55.16'","!['http://77.68.55.16','https://game.exudizmono.com','http://game.exudizmono.com'].includes(req.headers.origin)")
s=s.replace("host:'77.68.55.16'","host:process.env.DOMAIN")
s=s.replace('Max-Age=2592000`','Max-Age=2592000${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`')
p.write_text(s);(root/'game/api.mjs').write_text(s)
p=root/'runtime.env';s=p.read_text();s=s.replace('DOMAIN=77.68.55.16','DOMAIN=game.exudizmono.com').replace('JWT_ISSUER=http://77.68.55.16/backend','JWT_ISSUER=https://game.exudizmono.com/backend');
if 'COOKIE_SECURE=' not in s:s+='\nCOOKIE_SECURE=true\n'
p.write_text(s)
p=root/'public/stats.html';s=p.read_text().replace('FrontRank','Exudizmono').replace('FRONTRANK','EXUDIZMONO').replace('INDEPENDENT TEST SERVER','EXUDIZMONO GAME STATS').replace('IP-only HTTP is for testing; accounts and competitive play need HTTPS and recovery.','Guest accounts have no recovery yet.').replace('<strong>EXUDIZMONO</strong>','<a href="https://exudizmono.com/"><strong>EXUDIZMONO</strong></a>').replace('Built from OpenFront · © OpenFront and Contributors','Exudizmono · Based on OpenFront · © OpenFront and Contributors');p.write_text(s);(root/'deploy/stats.html').write_text(s)
print('Configured Exudizmono domain and secure cookies')
