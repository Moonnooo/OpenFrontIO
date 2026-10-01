const fs=require('fs');const file='/opt/frontrank/game/src/client/ClientEnv.ts';let s=fs.readFileSync(file,'utf8');
s=s.replace('static serverWsBase(): string {','static serverWsBase(): string {\n    if (window.location.hostname === "77.68.55.16") return "ws://" + window.location.host;');
s=s.replace('static serverHttpBase(): string {','static serverHttpBase(): string {\n    if (window.location.hostname === "77.68.55.16") return window.location.origin;');
s=s.replace('static jwtIssuer(): string {','static jwtIssuer(): string {\n    if (window.location.hostname === "77.68.55.16") return window.location.origin + "/backend";');
fs.writeFileSync(file,s);fs.writeFileSync('/opt/frontrank/deploy/ClientEnv.ts',s);
