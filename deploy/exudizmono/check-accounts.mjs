import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import {createAccounts} from './accounts.mjs';

const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE players(id TEXT PRIMARY KEY,public_id TEXT UNIQUE,username TEXT,created_at TEXT); CREATE TABLE sessions(token TEXT PRIMARY KEY,player_id TEXT,created_at TEXT);');
let time=Date.now(), deliveries=[], steamValid=true;
const site='https://game.exudizmono.com';
const accounts=createAccounts({db,origin:site,env:{DISCORD_CLIENT_ID:'test',DISCORD_CLIENT_SECRET:'test',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test'},now:()=>time,deliverEmail:async(email,link)=>deliveries.push({email,link}),request:async url=>{assert.equal(url,'https://steamcommunity.com/openid/login');return {ok:true,text:async()=>`ns:http://specs.openid.net/auth/2.0\nis_valid:${steamValid}\n`};}});
function req(cookie='',method='GET',data=null,origin=site) {const r=Readable.from(data?[JSON.stringify(data)]:[]);r.method=method;r.headers={cookie,origin,'content-type':'application/json'};r.socket={remoteAddress:'test'};return r;}
async function call(path,cookie='',method='GET',data=null,origin=site) {
  const res={status:0,headers:{},body:'',writeHead(status,headers){this.status=status;this.headers=headers;},end(body=''){this.body=body;}};
  assert.equal(await accounts.handle(req(cookie,method,data,origin),res,new URL(path,site)),true);return res;
}
const cookieOf=(response,name)=>[].concat(response.headers['Set-Cookie']||[]).find(s=>s.startsWith(name+'='))?.split(';')[0];
const guest=accounts.newPlayer();
assert.equal(accounts.trustTier(null),'untrusted');
assert.equal(accounts.trustTier(guest),'untrusted');
const guestCookie=accounts.session(guest,req()).split(';')[0];
assert.equal(accounts.current(req(guestCookie)).id,guest.id);
assert.equal(db.prepare('SELECT token FROM sessions').get().token===guestCookie.split('=')[1],false,'session token must be hashed');

let page=await call('/auth/signin',guestCookie);
let bindCookie=cookieOf(page,'exudizmono_auth');
const browserCookie=guestCookie+'; '+bindCookie;
assert.equal((await call('/auth/magic-link',browserCookie,'POST',{email:'alice@example.com'},'https://evil.example')).status,403);
assert.equal((await call('/auth/magic-link',browserCookie,'POST',{email:'Alice@example.com'})).status,200);
assert.equal(deliveries.length,1);
const token=new URL(deliveries[0].link).searchParams.get('token');
assert.equal((await call('/auth/email?token='+token,browserCookie)).status,200);
assert.equal(db.prepare('SELECT COUNT(*) n FROM email_links').get().n,1,'a GET scanner must not consume the link');
assert.equal((await call('/auth/email',browserCookie,'POST',{token,confirmation:'wrong'})).status,400);
let signed=await call('/auth/email',browserCookie,'POST',{token,confirmation:bindCookie.split('=')[1]});
assert.equal(signed.status,303);
let accountCookie=cookieOf(signed,'frontrank_session');
assert.equal(accounts.current(req(accountCookie)).id,guest.id,'first registration preserves guest player');
assert.equal(accounts.provider(guest),'email');
assert.equal(accounts.trustTier(guest),'trusted','verified email confers trust');
assert.deepEqual(accounts.identities(guest),{email:'alice@example.com'});
assert.equal(accounts.current(req(guestCookie)),null,'rotated guest session is invalid');
assert.equal((await call('/auth/email',browserCookie,'POST',{token,confirmation:bindCookie.split('=')[1]})).status,400,'link reuse denied');

// Sign into the same account from another device: it retains the registered identity.
const secondGuest=accounts.newPlayer(), secondCookie=accounts.session(secondGuest,req()).split(';')[0];
page=await call('/auth/signin',secondCookie);bindCookie=cookieOf(page,'exudizmono_auth');
await call('/auth/magic-link',secondCookie+'; '+bindCookie,'POST',{email:'alice@example.com'});
const secondToken=new URL(deliveries.at(-1).link).searchParams.get('token');
const thirdPage=await call('/auth/email?token='+secondToken);const thirdBinding=cookieOf(thirdPage,'exudizmono_auth');
signed=await call('/auth/email',thirdBinding,'POST',{token:secondToken,confirmation:thirdBinding.split('=')[1]});
const otherSession=cookieOf(signed,'frontrank_session');
assert.equal(accounts.current(req(otherSession)).id,guest.id);
assert.equal(accounts.provider(secondGuest),'guest','existing-account login does not merge guest identities');
assert.equal((await call('/auth/logout',accountCookie,'POST',{},'https://evil.example')).status,403);
assert.equal((await call('/auth/revoke',accountCookie,'POST',{})).status,200);
assert.equal(accounts.current(req(accountCookie)),null);assert.equal(accounts.current(req(otherSession)),null);

await call('/auth/magic-link',secondCookie+'; '+bindCookie,'POST',{email:'expired@example.com'});
const expiredToken=new URL(deliveries.at(-1).link).searchParams.get('token');time+=900001;
assert.equal((await call('/auth/email?token='+expiredToken)).status,400);

let start=await call('/auth/login/discord',secondCookie);
let target=new URL(start.headers.Location),state=target.searchParams.get('state');
assert.equal(target.origin,'https://discord.com');assert.equal(target.searchParams.get('scope'),'identify');
assert.equal(target.searchParams.get('redirect_uri'),site+'/backend/auth/callback/discord');
assert.equal((await call('/auth/callback/discord?state='+state+'&code=bogus','exudizmono_auth=wrong')).status,400);
assert.equal((await call('/auth/callback/discord?state='+state+'&error=access_denied',cookieOf(start,'exudizmono_auth'))).status,400);
start=await call('/auth/login/google',secondCookie);target=new URL(start.headers.Location);
assert.equal(target.searchParams.get('code_challenge_method'),'S256');assert.equal(target.searchParams.get('nonce'),target.searchParams.get('state'));

async function steamResponse(valid) {
  steamValid=valid;start=await call('/auth/login/steam',secondCookie);target=new URL(start.headers.Location);
  const returnTo=target.searchParams.get('openid.return_to');state=new URL(returnTo).searchParams.get('state');
  const query=new URLSearchParams({state,'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'id_res','openid.op_endpoint':'https://steamcommunity.com/openid/login','openid.return_to':returnTo,'openid.claimed_id':'https://steamcommunity.com/openid/id/76561198000000000','openid.identity':'https://steamcommunity.com/openid/id/76561198000000000','openid.response_nonce':new Date(time).toISOString().replace(/\.\d{3}Z$/,'Z')+'test'+String(valid),'openid.assoc_handle':'test','openid.signed':'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle','openid.sig':'test'});
  const response=await call('/auth/callback/steam?'+query,secondCookie+'; '+cookieOf(start,'exudizmono_auth'));return {response,query,cookie:secondCookie+'; '+cookieOf(start,'exudizmono_auth')};
}
assert.equal((await steamResponse(false)).response.status,400,'unverified Steam assertion denied');
assert.equal(accounts.trustTier(secondGuest),'untrusted','failed Steam verification cannot confer trust');
const steam=await steamResponse(true);assert.equal(steam.response.status,303);
assert.equal(accounts.current(req(cookieOf(steam.response,'frontrank_session'))).id,secondGuest.id);
assert.equal(accounts.identities(secondGuest).steam.steamId,'76561198000000000');
assert.equal(accounts.trustTier(secondGuest),'trusted','verified Steam alone is sufficient');
for(const provider of ['google','discord']) {
 const account=accounts.newPlayer();
 db.prepare('INSERT INTO identities VALUES(?,?,?,?)').run(provider,'test-'+provider,account.id,'{}');
 assert.equal(accounts.trustTier(account),'trusted');
 db.prepare('DELETE FROM identities WHERE player_id=?').run(account.id);
 assert.equal(accounts.trustTier(account),'untrusted','trust follows persisted identities');
}
assert.equal((await call('/auth/callback/steam?'+steam.query,steam.cookie)).status,400,'OAuth state reuse denied');

const missing=createAccounts({db,origin:site,env:{},now:()=>time});assert.deepEqual(missing.available(),{discord:false,google:false,steam:true,email:false});
assert.equal((await call('/auth/providers')).status,200);
console.log('PASS: hashed sessions; guest upgrade; cross-device account login; one-use, expiring email links; scanner-safe confirmation; CSRF rejection; logout-all; OAuth state binding; Google PKCE; Steam verification and replay rejection. No real messages or provider accounts used.');
db.close();
