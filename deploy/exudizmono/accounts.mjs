import crypto from 'node:crypto';
import {createRemoteJWKSet, jwtVerify} from 'jose';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cookieValue = (req, name) => req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(name+'='))?.slice(name.length+1);

// Injected transports are for isolated tests, never chosen by HTTP input.
export function createAccounts({db, origin, secure=true, env=process.env, request=fetch, deliverEmail, now=Date.now}) {
  const site = new URL(origin).origin;
  const callback = provider => site+'/backend/auth/callback/'+provider;
  const sessionLifetime = 30*86400000;
  db.exec(`CREATE TABLE IF NOT EXISTS identities(provider TEXT NOT NULL, subject TEXT NOT NULL, player_id TEXT NOT NULL REFERENCES players(id), profile TEXT NOT NULL, PRIMARY KEY(provider,subject));
    CREATE TABLE IF NOT EXISTS auth_states(token_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL, provider TEXT NOT NULL, player_id TEXT, intent TEXT NOT NULL, verifier TEXT, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS email_links(token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, player_id TEXT, binding_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_limits(bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS steam_nonces(nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);`);
  const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const cookie = (name,value,seconds) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${secure?'; Secure':''}`;
  const clearSession = () => cookie('frontrank_session','',0);
  const binding = req => cookieValue(req,'exudizmono_auth');
  function clean() { for(const table of ['auth_states','email_links','auth_limits','steam_nonces']) db.prepare(`DELETE FROM ${table} WHERE expires_at < ?`).run(now()); }
  function limit(bucket, maximum, ms) {
    const row=db.prepare('SELECT * FROM auth_limits WHERE bucket=?').get(bucket);
    if(row && row.expires_at>now() && row.count>=maximum) return false;
    db.prepare('INSERT INTO auth_limits VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET count=excluded.count,expires_at=excluded.expires_at').run(bucket,row&&row.expires_at>now()?row.count+1:1,row&&row.expires_at>now()?row.expires_at:now()+ms);
    return true;
  }
  function current(req) {
    const token=cookieValue(req,'frontrank_session'); if(!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare('SELECT p.* FROM sessions s JOIN players p ON p.id=s.player_id WHERE s.token IN (?,?) AND s.created_at>?').get(token,hash(token),new Date(now()-sessionLifetime).toISOString())||null;
  }
  function identities(p) { const data={}; if(p) for(const row of db.prepare('SELECT provider,profile FROM identities WHERE player_id=?').all(p.id)) data[row.provider]=JSON.parse(row.profile); return data; }
  // Only persisted identities created after provider verification confer trust.
  function trustTier(p) { return p && db.prepare("SELECT 1 FROM identities WHERE player_id=? AND provider IN ('steam','discord','google','email') LIMIT 1").get(p.id) ? 'trusted' : 'untrusted'; }
  function provider(p) { return p?db.prepare('SELECT provider FROM identities WHERE player_id=? LIMIT 1').get(p.id)?.provider||'guest':'guest'; }
  function newPlayer() {
    const p={id:crypto.randomUUID(),public_id:crypto.randomBytes(9).toString('base64url'),username:null,created_at:new Date(now()).toISOString()};
    db.prepare('INSERT INTO players VALUES(?,?,?,?)').run(p.id,p.public_id,null,p.created_at); return p;
  }
  function session(p,req) {
    const previous=cookieValue(req,'frontrank_session');
    if(previous) db.prepare('DELETE FROM sessions WHERE token IN (?,?)').run(previous,hash(previous));
    const token=crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),p.id,new Date(now()).toISOString());
    return cookie('frontrank_session',token,sessionLifetime/1000);
  }
  // Only upgrade the initiating guest. Never silently merge two registered accounts.
  function resolveIdentity(providerName,subject,profile,guestId,intent='login') {
    const existing=db.prepare('SELECT player_id FROM identities WHERE provider=? AND subject=?').get(providerName,subject);
    if(existing) {
      if(intent==='link' && existing.player_id!==guestId) throw Error('That identity belongs to another account.');
      db.prepare('UPDATE identities SET profile=? WHERE provider=? AND subject=?').run(JSON.stringify(profile),providerName,subject);
      return db.prepare('SELECT * FROM players WHERE id=?').get(existing.player_id);
    }
    let p=guestId?db.prepare('SELECT * FROM players WHERE id=?').get(guestId):null;
    if(intent==='login' && p && provider(p)!=='guest') p=null;
    p??=newPlayer();
    db.prepare('INSERT INTO identities VALUES(?,?,?,?)').run(providerName,subject,p.id,JSON.stringify(profile)); return p;
  }
  function available() { return {discord:!!(env.DISCORD_CLIENT_ID&&env.DISCORD_CLIENT_SECRET),google:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),steam:true,email:!!(deliverEmail||(env.RESEND_API_KEY&&env.MAIL_FROM))}; }
  function json(res,status,data,headers={}) {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
  function redirect(res,url,headers={}) {res.writeHead(303,{'Location':url,'Cache-Control':'no-store',...headers});res.end();}
  function html(res,status,body,headers={}) {res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src https://community.fastly.steamstatic.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",...headers});res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Exudizmono</title><style>body{background:#111820;color:#edf1f5;font:16px system-ui;margin:0;padding:40px 20px}main{max-width:460px;margin:auto}h1{font-size:32px}a{color:#bbef63}button,.provider{display:block;box-sizing:border-box;width:100%;margin:12px 0;padding:14px;border:1px solid #566171;border-radius:10px;background:#253142;color:white;text-align:center;text-decoration:none;font:inherit}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}input{box-sizing:border-box;width:100%;padding:14px;border-radius:8px;border:1px solid #566171;background:#17212c;color:white;font:inherit}.muted{color:#a3afbd;font-size:14px}.brand{font-weight:800;letter-spacing:2px}hr{border:0;border-top:1px solid #364353;margin:24px 0}</style><main><a class="brand" href="https://exudizmono.com/">EXUDIZMONO</a>${body}<hr><a href="${site}/">Back to game</a> · <a href="${site}/stats/">Stats</a></main></html>`);}
  function errorPage(res,message,status=400) {html(res,status,`<h1>Sign-in could not finish</h1><p>${escape(message)}</p><a class="provider" href="${site}/backend/auth/signin">Try again</a>`);}
  function startState(req,providerName,intent) {
    const token=random(), bind=binding(req)||random(), p=current(req), verifier=providerName==='google'?random():null;
    db.prepare('INSERT INTO auth_states VALUES(?,?,?,?,?,?,?)').run(hash(token),hash(bind),providerName,p?.id||null,intent,verifier,now()+600000);
    return {token,verifier,cookie:cookie('exudizmono_auth',bind,1800)};
  }
  async function body(req) {let text='',length=0;for await(const chunk of req){length+=chunk.length;if(length>4096)throw Error('Request too large');text+=chunk;}return req.headers['content-type']?.includes('application/json')?JSON.parse(text):Object.fromEntries(new URLSearchParams(text));}
  const requireOrigin=req=>req.headers.origin===site;
  async function sendEmail(email,link) {
    if(deliverEmail) return deliverEmail(email,link);
    const response=await request('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.MAIL_FROM,to:[email],subject:'Your Exudizmono sign-in link',text:`Sign in to Exudizmono:\n\n${link}\n\nThis link expires in 15 minutes and works once. If you did not request it, ignore this email.`}),signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw Error('Email delivery unavailable');
  }
  async function handle(req,res,u) {
    const path=u.pathname;if(!path.startsWith('/auth/'))return false; clean();
    try {
      if(req.method==='GET' && path==='/auth/providers') {json(res,200,available());return true;}
      if(req.method==='GET' && path==='/auth/signin') {
        const ready=available(), bind=binding(req)||random();
        const buttons=['discord','google','steam'].map(name=>ready[name]?`<a class="provider" href="${site}/backend/auth/login/${name}">${name==='steam'?'<img width="180" height="35" alt="Sign in through Steam" src="https://community.fastly.steamstatic.com/public/images/signinthroughsteam/sits_01.png">':'Continue with '+name[0].toUpperCase()+name.slice(1)}</a>`:`<button disabled>Continue with ${name[0].toUpperCase()+name.slice(1)} — coming soon</button>`).join('');
        html(res,200,`<h1>Welcome back</h1><p>Sign in to keep your match history and stats across devices.</p>${buttons}<hr><form method="post" action="${site}/backend/auth/magic-link"><label for="email">Email address</label><input id="email" name="email" type="email" maxlength="254" autocomplete="email" required ${ready.email?'':'disabled'}><button ${ready.email?'':'disabled'}>Email me a sign-in link</button></form><p class="muted">${ready.email?'No password needed. Links expire in 15 minutes.':'Email sign-in is coming soon.'} Guest progress is kept when you create your first account. Signing into an existing account loads that account’s stats.</p>`,{'Set-Cookie':cookie('exudizmono_auth',bind,1800)});return true;
      }
      const login=path.match(/^\/auth\/(login|link)\/(discord|google|steam)$/);
      if(req.method==='GET' && login) {
        const [,intent, name]=login, ready=available();
        if(!ready[name]) {errorPage(res,'This sign-in option is not configured yet. Please use another available option.',503);return true;}
        if(intent==='link' && (!current(req)||provider(current(req))==='guest')) {json(res,401,{error:'Sign in before linking an account.'});return true;}
        const state=startState(req,name,intent), target=new URL(name==='google'?'https://accounts.google.com/o/oauth2/v2/auth':name==='discord'?'https://discord.com/oauth2/authorize':'https://steamcommunity.com/openid/login');
        if(name==='steam') {
          for(const [key,value] of Object.entries({'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'checkid_setup','openid.return_to':callback(name)+'?state='+state.token,'openid.realm':site+'/','openid.identity':'http://specs.openid.net/auth/2.0/identifier_select','openid.claimed_id':'http://specs.openid.net/auth/2.0/identifier_select'})) target.searchParams.set(key,value);
        } else {
          for(const [key,value] of Object.entries({client_id:env[name.toUpperCase()+'_CLIENT_ID'],response_type:'code',redirect_uri:callback(name),scope:name==='google'?'openid email':'identify',state:state.token}))target.searchParams.set(key,value);
          if(name==='google') {target.searchParams.set('nonce',state.token);target.searchParams.set('code_challenge',crypto.createHash('sha256').update(state.verifier).digest('base64url'));target.searchParams.set('code_challenge_method','S256');}
        }
        if(intent==='link')json(res,200,{url:target.href},{'Set-Cookie':state.cookie});else redirect(res,target.href,{'Set-Cookie':state.cookie});return true;
      }
      const finish=path.match(/^\/auth\/callback\/(discord|google|steam)$/);
      if(req.method==='GET' && finish) {
        if(new Set(u.searchParams.keys()).size!==[...u.searchParams].length)throw Error('Duplicate callback parameters.');
        const name=finish[1], state=u.searchParams.get('state'), bind=binding(req);
        const row=state?db.prepare('SELECT * FROM auth_states WHERE token_hash=?').get(hash(state)):null;
        if(!row || row.provider!==name || !bind || row.binding_hash!==hash(bind) || row.expires_at<now())throw Error('Your sign-in request expired. Please start again.');
        db.prepare('DELETE FROM auth_states WHERE token_hash=?').run(hash(state));
        // Linking must still be performed by the account that began this flow.
        if(row.intent==='link' && current(req)?.id!==row.player_id)throw Error('Your account changed during sign-in. Please start again.');
        if(u.searchParams.has('error')||u.searchParams.get('openid.mode')==='cancel')throw Error('Sign-in was cancelled.');
        let subject, profile;
        if(name==='steam') {
          if(u.searchParams.get('openid.ns')!=='http://specs.openid.net/auth/2.0'||u.searchParams.get('openid.mode')!=='id_res'||u.searchParams.get('openid.op_endpoint')!=='https://steamcommunity.com/openid/login'||u.searchParams.get('openid.return_to')!==callback(name)+'?state='+state)throw Error('Invalid Steam sign-in response.');
          const claimed=u.searchParams.get('openid.claimed_id'), id=claimed?.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/)?.[1];
          if(!id || u.searchParams.get('openid.identity')!==claimed)throw Error('Invalid Steam identity.');
          const signed=new Set((u.searchParams.get('openid.signed')||'').split(','));
          for(const key of ['op_endpoint','claimed_id','identity','return_to','response_nonce','assoc_handle'])if(!signed.has(key))throw Error('Invalid Steam signature.');
          const nonce=u.searchParams.get('openid.response_nonce'), timestamp=Date.parse(nonce?.slice(0,20));
          if(!Number.isFinite(timestamp)||Math.abs(now()-timestamp)>300000 || db.prepare('SELECT 1 FROM steam_nonces WHERE nonce=?').get(nonce))throw Error('Steam sign-in expired.');
          const params=new URLSearchParams();for(const [key,value] of u.searchParams)if(key.startsWith('openid.'))params.append(key,value);params.set('openid.mode','check_authentication');
          const verified=await request('https://steamcommunity.com/openid/login',{method:'POST',body:params,signal:AbortSignal.timeout(10000)});
          if(!verified.ok || !(await verified.text()).split(/\r?\n/).includes('is_valid:true'))throw Error('Steam could not verify this sign-in.');
          db.prepare('INSERT INTO steam_nonces VALUES(?,?)').run(nonce,now()+600000);subject=id;profile={steamId:id,personaName:null,avatarUrl:null};
        } else {
          const code=u.searchParams.get('code');if(!code||code.length>4096)throw Error('Invalid sign-in response.');
          const params=new URLSearchParams({client_id:env[name.toUpperCase()+'_CLIENT_ID'],client_secret:env[name.toUpperCase()+'_CLIENT_SECRET'],grant_type:'authorization_code',code,redirect_uri:callback(name)});
          if(name==='google')params.set('code_verifier',row.verifier);
          const tokenResponse=await request(name==='google'?'https://oauth2.googleapis.com/token':'https://discord.com/api/oauth2/token',{method:'POST',body:params,signal:AbortSignal.timeout(10000)});
          if(!tokenResponse.ok)throw Error('The provider could not verify this sign-in.');const tokens=await tokenResponse.json();
          if(name==='google') {
            const {payload}=await jwtVerify(tokens.id_token,googleKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GOOGLE_CLIENT_ID,algorithms:['RS256']});
            if(payload.nonce!==state || !payload.sub || payload.email_verified!==true || typeof payload.email!=='string')throw Error('Google did not return a verified email address.');
            subject=payload.sub;profile={email:payload.email};
          } else {
            const identityResponse=await request('https://discord.com/api/users/@me',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(10000)});
            if(!identityResponse.ok)throw Error('Discord could not verify this sign-in.');const account=await identityResponse.json();
            if(typeof account.id!=='string'||typeof account.username!=='string')throw Error('Invalid Discord account.');
            subject=account.id;profile={id:account.id,username:account.username,avatar:account.avatar||null,global_name:account.global_name||null,discriminator:account.discriminator||'0'};
          }
        }
        const initialPlayer=current(req)?.id===row.player_id?row.player_id:null;
        const p=resolveIdentity(name,subject,profile,initialPlayer,row.intent);
        redirect(res,site+'/',{'Set-Cookie':[session(p,req),cookie('exudizmono_auth','',0)]});return true;
      }
      if(req.method==='POST' && path==='/auth/magic-link') {
        if(!requireOrigin(req)){json(res,403,{error:'Wrong origin'});return true;}
        if(!available().email){json(res,503,{error:'Email sign-in is not configured yet.'});return true;}
        const data=await body(req), email=String(data.email||'').trim().toLowerCase();
        if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)){json(res,400,{error:'Enter a valid email address.'});return true;}
        const ip=req.headers['x-real-ip']||req.socket.remoteAddress;
        if(!limit('mail-ip:'+ip,10,3600000)||!limit('mail:'+hash(email),3,900000)){json(res,429,{error:'Please wait before requesting another link.'});return true;}
        const token=random(), bind=binding(req)||random(), p=current(req);
        db.prepare('INSERT INTO email_links VALUES(?,?,?,?,?)').run(hash(token),email,p&&provider(p)==='guest'?p.id:null,hash(bind),now()+900000);
        try {await sendEmail(email,site+'/backend/auth/email?token='+token);}catch{db.prepare('DELETE FROM email_links WHERE token_hash=?').run(hash(token));json(res,503,{error:'Email delivery is unavailable. Please try again later.'});return true;}
        const headers={'Set-Cookie':cookie('exudizmono_auth',bind,1800)};
        if(req.headers['content-type']?.includes('application/json'))json(res,200,{ok:true},headers);
        else html(res,200,'<h1>Check your inbox</h1><p>Your sign-in link is on its way. It expires in 15 minutes and can be used once.</p>',headers);return true;
      }
      // GET only displays confirmation. Mail scanners cannot consume a link.
      if(req.method==='GET' && path==='/auth/email') {
        const token=u.searchParams.get('token'), row=token?db.prepare('SELECT * FROM email_links WHERE token_hash=?').get(hash(token)):null;
        if(!row||row.expires_at<now())throw Error('This email link is invalid or expired. Please request another.');
        const bind=binding(req)||random();
        html(res,200,`<h1>Confirm sign-in</h1><p>Continue as ${escape(row.email)}?</p><form method="post" action="${site}/backend/auth/email"><input type="hidden" name="token" value="${escape(token)}"><input type="hidden" name="confirmation" value="${escape(bind)}"><button>Sign in to Exudizmono</button></form>`,{'Set-Cookie':cookie('exudizmono_auth',bind,1800)});return true;
      }
      if(req.method==='POST' && path==='/auth/email') {
        if(!requireOrigin(req)){json(res,403,{error:'Wrong origin'});return true;}
        const data=await body(req), bind=binding(req);
        if(!bind||bind!==data.confirmation)throw Error('Please reopen the email link to confirm sign-in.');
        const row=db.prepare('SELECT * FROM email_links WHERE token_hash=?').get(hash(String(data.token||'')));
        if(!row||row.expires_at<now())throw Error('This email link has already been used or expired.');
        db.prepare('DELETE FROM email_links WHERE token_hash=?').run(hash(data.token));
        // Cross-device sign-in works, but cannot attach the other device’s guest progress.
        const guestId=row.binding_hash===hash(bind)&&current(req)?.id===row.player_id?row.player_id:null;
        const p=resolveIdentity('email',row.email,row.email,guestId);
        redirect(res,site+'/',{'Set-Cookie':[session(p,req),cookie('exudizmono_auth','',0)]});return true;
      }
      if(req.method==='POST' && ['/auth/logout','/auth/revoke'].includes(path)) {
        if(!requireOrigin(req)){json(res,403,{error:'Wrong origin'});return true;}
        const token=cookieValue(req,'frontrank_session'), p=current(req);
        if(path==='/auth/revoke'&&p)db.prepare('DELETE FROM sessions WHERE player_id=?').run(p.id);
        else if(token)db.prepare('DELETE FROM sessions WHERE token IN (?,?)').run(token,hash(token));
        json(res,200,{ok:true},{'Set-Cookie':clearSession()});return true;
      }
      return false;
    } catch {errorPage(res,'Your sign-in could not be verified. Please return to the game and start again.');return true;}
  }
  return {handle,current,identities,provider,trustTier,newPlayer,session,available};
}
