const fs=require('fs');
function edit(file,from,to){const s=fs.readFileSync(file,'utf8');if(!s.includes(from))throw Error('Patch target missing: '+file);fs.writeFileSync(file,s.replace(from,to));}
edit('src/client/ApiBase.ts','const domainname = getAudience();','if (window.location.hostname === "77.68.55.16") return window.location.origin + "/backend";\n  const domainname = getAudience();');
edit('src/server/ServerEnv.ts','const audience = ServerEnv.jwtAudience();','if (process.env.STANDALONE_API_URL) return process.env.STANDALONE_API_URL;\n    const audience = ServerEnv.jwtAudience();');
edit('src/server/ServerEnv.ts','return ServerEnv.gameEnv === GameEnv.Dev ? 5 * 1000 : 2 * 60 * 1000;','return process.env.STANDALONE_API_URL ? 60 * 1000 : ServerEnv.gameEnv === GameEnv.Dev ? 5 * 1000 : 2 * 60 * 1000;');
edit('src/server/jwt.ts','if (ServerEnv.env() === GameEnv.Dev) {','if (ServerEnv.env() === GameEnv.Dev && !process.env.STANDALONE_API_URL) {');
edit('src/server/MasterLobbyService.ts','QUEUED_LOBBIES_PER_TYPE = 6','QUEUED_LOBBIES_PER_TYPE = 2');
// Retain required attribution; make the fork/test status visible.
edit('index.html','<body','<body');
let index=fs.readFileSync('index.html','utf8');index=index.replace('</body>','<div style="position:fixed;bottom:0;left:0;z-index:9999;background:#142018;color:#c7f66a;padding:6px 12px;font:12px sans-serif">Independent fork · IP test server · <a href="/stats/" style="color:inherit">Our leaderboard</a> · <a href="/source.tar.gz" style="color:inherit">Source & licences</a></div></body>');fs.writeFileSync('index.html',index);
fs.mkdirSync('proprietary',{recursive:true});
console.log('Applied standalone backend and test server patches.');
