import http from 'node:http';
import {validateRegistration} from './public/registration-core.js';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { initializeDatabase } from './seed.mjs';

const PORT = Number(process.env.PORT || 4310);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = resolve(process.env.MORI_PUBLIC_DIR || './public');
const DB_PATH = process.env.MORI_DB_PATH || './mori.sqlite';
const db = initializeDatabase(DB_PATH);
db.exec('CREATE TABLE IF NOT EXISTS registrations (id TEXT PRIMARY KEY,json TEXT NOT NULL)');
const loginFailures = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...securityHeaders, ...jsonHeaders, 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
async function readJson(req, max = 1_000_000) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > max) { const e = new Error('Payload too large'); e.status = 413; throw e; } chunks.push(chunk); }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { const e = new Error('Invalid JSON'); e.status = 400; throw e; }
}
function cookie(req, name) { const raw = req.headers.cookie || ''; return raw.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || ''; }
function userFrom(req) {
  const token = cookie(req, 'mori_session'); if (!token) return null;
  return db.prepare(`SELECT u.id,u.email,u.name,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.active=1`).get(token, new Date().toISOString()) || null;
}
function requireUser(req, res, admin = false) { const user = userFrom(req); if (!user) { send(res, 401, { error: '請先登入' }); return null; } if (admin && user.role !== 'admin') { send(res, 403, { error: '權限不足' }); return null; } return user; }
function sameOrigin(req) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return true;
  const origin = req.headers.origin; if (!origin) return true;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return origin === `${proto}://${req.headers.host}`;
}
function verifyPassword(password, stored) { try { const [salt, hex] = stored.split(':'); const got = scryptSync(password, salt, 64); return timingSafeEqual(got, Buffer.from(hex, 'hex')); } catch { return false; } }
function cleanUser(row) { return row && { id: row.id, email: row.email, name: row.name, role: row.role, active: Boolean(row.active) }; }
function list(kind, publishedOnly = false) { return db.prepare(`SELECT json FROM content WHERE kind=? AND deleted=0 ${publishedOnly ? "AND json_extract(json,'$.status')='published'" : ''} ORDER BY rowid DESC`).all(kind).map(r => JSON.parse(r.json)); }
function settings() { return JSON.parse(db.prepare('SELECT json FROM settings WHERE id=1').get().json); }
function audit(actor, action, kind = null, targetId = null, snapshot = null) { const id = randomUUID(); db.prepare('INSERT INTO audit(id,actor,action,time,kind,target_id,snapshot) VALUES(?,?,?,?,?,?,?)').run(id, actor, action, new Date().toISOString(), kind, targetId, snapshot ? JSON.stringify(snapshot) : null); return id; }
function validateUrl(value) { if (!value) return ''; try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? value : null; } catch { return null; } }
function validateAssetUrl(value) {
  if (!value) return '';
  if (typeof value !== 'string') return null;
  if (/^\/(?!\/)/.test(value) && !value.includes('\\')) return value;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? value : null; } catch { return null; }
}
function validCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
const contentFields = {
  posts: ['title','type','category','summary','body','image','date','location','registrationUrl','status','isDemo'],
  ledger: ['date','type','category','amount','note','isDemo','status'],
  reports: ['title','year','url','status','isDemo']
};
function validateContent(kind, input, existing = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = { ...existing };
  for (const key of contentFields[kind]) if (key in input) value[key] = input[key];
  const stringFields = kind === 'posts' ? ['title','type','category','summary','body','image','date','location','registrationUrl','status'] : kind === 'ledger' ? ['date','type','category','note','status'] : ['title','url','status'];
  if (stringFields.some(key => typeof value[key] !== 'string')) return null;
  for (const key of stringFields) value[key] = value[key].trim();
  if (kind === 'posts' && (!value.title || !['activity','story','news'].includes(value.type) || !['draft','published'].includes(value.status))) return null;
  if (kind === 'posts' && (validateUrl(value.registrationUrl) === null || validateAssetUrl(value.image) === null)) return null;
  if (kind === 'ledger' && (!validCalendarDate(value.date) || !['income','expense'].includes(value.type) || !value.category || !Number.isSafeInteger(value.amount) || value.amount < 0 || value.amount > 1_000_000_000 || !['draft','published'].includes(value.status))) return null;
  if (kind === 'reports' && (!value.title || !Number.isInteger(value.year) || value.year < 1900 || !['draft','published'].includes(value.status) || validateUrl(value.url) === null)) return null;
  value.isDemo = Boolean(value.isDemo); return value;
}
function saveContent(kind, input, id, actor) {
  const oldRow = id ? db.prepare('SELECT json FROM content WHERE kind=? AND id=? AND deleted=0').get(kind,id) : null;
  const old = oldRow ? JSON.parse(oldRow.json) : {}; const next = validateContent(kind, input, old); if (!next) return null;
  next.id = id || randomUUID();
  if (oldRow) audit(actor.email, 'update', kind, next.id, old);
  else audit(actor.email, 'create', kind, next.id, next);
  db.prepare('INSERT INTO content(kind,id,json,deleted) VALUES(?,?,?,0) ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json,deleted=0').run(kind,next.id,JSON.stringify(next));
  return next;
}
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!rel || !extname(rel)) rel = 'index.html';
  const file = normalize(join(PUBLIC_DIR, rel));
  if (!(file === PUBLIC_DIR || file.startsWith(`${PUBLIC_DIR}${sep}`)) || !existsSync(file) || !statSync(file).isFile()) { send(res, 404, { error: 'Not found' }); return; }
  const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json; charset=utf-8' }[extname(file)] || 'application/octet-stream';
  res.writeHead(200, { ...securityHeaders, 'Content-Type': mime, 'Cache-Control': ['.html','.js','.css'].includes(extname(file))?'no-cache':'public, max-age=86400' }); createReadStream(file).pipe(res);
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); const p = url.pathname;
    if (!sameOrigin(req)) return send(res, 403, { error: 'Origin rejected' });
    if (req.method === 'GET' && p === '/api/content') return send(res, 200, { settings: settings(), posts: list('posts',true), ledger: list('ledger',true), reports: list('reports',true) });
    if (req.method === 'GET' && p === '/api/admin/me') return send(res, 200, { user: cleanUser(userFrom(req)) });
    if (req.method === 'POST' && p === '/api/admin/login') {
      const now = Date.now(); const ip = req.socket.remoteAddress || 'unknown';
      const recent = (loginFailures.get(ip) || []).filter(time => now - time < LOGIN_WINDOW_MS); loginFailures.set(ip, recent);
      if (recent.length >= LOGIN_MAX_FAILURES) return send(res, 429, { error:'登入嘗試次數過多，請稍後再試' });
      const b = await readJson(req); const email = typeof b.email === 'string' ? b.email.trim() : ''; const password = typeof b.password === 'string' ? b.password : '';
      if (!email || email.length > 254 || !password || password.length > 200) return send(res, 400, { error:'登入資料格式錯誤' });
      const row = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1').get(email);
      if (!row || !verifyPassword(password, row.password_hash)) { recent.push(now); loginFailures.set(ip, recent); return send(res, 401, { error:'帳號或密碼錯誤' }); }
      loginFailures.delete(ip);
      const token = randomBytes(32).toString('hex'); const exp = new Date(Date.now()+8*60*60*1000).toISOString(); db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token,row.id,exp); audit(row.email,'login');
      return send(res, 200, { user: cleanUser(row) }, { 'Set-Cookie': `mori_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}` });
    }
    if (req.method === 'POST' && p === '/api/admin/logout') { const u=userFrom(req); const t=cookie(req,'mori_session'); if(t) db.prepare('DELETE FROM sessions WHERE token=?').run(t); if(u) audit(u.email,'logout'); return send(res,200,{ok:true},{'Set-Cookie':'mori_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}); }
    if(req.method==='POST' && p==='/api/registrations'){const b=await readJson(req);let row;try{row=validateRegistration(b,list('posts',true));}catch(e){return send(res,400,{error:e.message});}const prior=db.prepare('SELECT json FROM registrations').all().map(x=>JSON.parse(x.json)).find(x=>x.eventId===row.eventId&&x.email===row.email);if(prior)return send(res,200,{id:prior.id,duplicate:true});row.id=randomUUID();db.prepare('INSERT INTO registrations VALUES(?,?)').run(row.id,JSON.stringify(row));return send(res,201,{id:row.id});}
    if (req.method === 'POST' && p === '/api/subscribe') { const b=await readJson(req); const email=String(b.email||'').trim().toLowerCase(); if(b.consent!==true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res,400,{error:'請提供有效 Email 並同意訂閱'}); let row=db.prepare('SELECT * FROM subscribers WHERE email=?').get(email); if(!row){row={id:randomUUID(),email,consented_at:new Date().toISOString(),active:1,token:randomBytes(24).toString('hex')};db.prepare('INSERT INTO subscribers VALUES(?,?,?,?,?)').run(row.id,row.email,row.consented_at,1,row.token);}else db.prepare('UPDATE subscribers SET active=1,consented_at=? WHERE id=?').run(new Date().toISOString(),row.id); return send(res,200,{ok:true,unsubscribeToken:row.token}); }
    if (req.method === 'POST' && p === '/api/unsubscribe') { const b=await readJson(req); const out=db.prepare('UPDATE subscribers SET active=0 WHERE token=?').run(String(b.token||'')); return send(res,out.changes?200:404,out.changes?{ok:true}:{error:'無效的取消訂閱連結'}); }

    if (p.startsWith('/api/admin/')) {
      const actor=requireUser(req,res); if(!actor) return;
      if(req.method==='GET' && p==='/api/admin/registrations')return send(res,200,db.prepare('SELECT json FROM registrations').all().map(x=>JSON.parse(x.json)));
      if (req.method==='GET' && p==='/api/admin/content') return send(res,200,{settings:settings(),posts:list('posts'),ledger:list('ledger'),reports:list('reports')});
      if (req.method==='PUT' && p==='/api/admin/settings') { const b=await readJson(req); const allowed=Object.keys(settings()); const next=settings(); for(const k of allowed) if(k in b){if(typeof b[k]!=='string')return send(res,400,{error:'欄位格式錯誤'});next[k]=b[k].trim();} for(const k of ['lineUrl','instagramUrl','facebookUrl','groupUrl']) if(validateUrl(next[k])===null) return send(res,400,{error:'網址格式錯誤'}); if(validateAssetUrl(next.heroImage)===null)return send(res,400,{error:'首頁圖片網址格式錯誤'}); db.prepare('UPDATE settings SET json=? WHERE id=1').run(JSON.stringify(next)); audit(actor.email,'update','settings','1',next); return send(res,200,next); }
      const m=p.match(/^\/api\/admin\/(posts|ledger|reports)(?:\/([^/]+))?$/);
      if(m && req.method==='POST' && !m[2]) { const saved=saveContent(m[1],await readJson(req),null,actor); return saved?send(res,201,saved):send(res,400,{error:'欄位格式錯誤'}); }
      if(m && req.method==='PUT' && m[2]) { const exists=db.prepare('SELECT 1 FROM content WHERE kind=? AND id=? AND deleted=0').get(m[1],m[2]); if(!exists)return send(res,404,{error:'找不到資料'}); const saved=saveContent(m[1],await readJson(req),m[2],actor); return saved?send(res,200,saved):send(res,400,{error:'欄位格式錯誤'}); }
      if(m && req.method==='DELETE' && m[2]) { const old=db.prepare('SELECT json FROM content WHERE kind=? AND id=? AND deleted=0').get(m[1],m[2]); if(!old)return send(res,404,{error:'找不到資料'}); db.prepare('UPDATE content SET deleted=1 WHERE kind=? AND id=?').run(m[1],m[2]); audit(actor.email,'delete',m[1],m[2],JSON.parse(old.json)); return send(res,200,{ok:true}); }
      const restore=p.match(/^\/api\/admin\/posts\/([^/]+)\/restore$/);
      if(restore && req.method==='POST'){const b=await readJson(req);const rev=db.prepare("SELECT * FROM audit WHERE id=? AND kind='posts' AND target_id=? AND snapshot IS NOT NULL").get(String(b.revisionId||''),restore[1]);if(!rev)return send(res,404,{error:'找不到修訂版本'});const snap=JSON.parse(rev.snapshot);snap.id=restore[1];db.prepare('INSERT INTO content(kind,id,json,deleted) VALUES(?,?,?,0) ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json,deleted=0').run('posts',restore[1],JSON.stringify(snap));audit(actor.email,'restore','posts',restore[1],snap);return send(res,200,snap);}
      if(req.method==='GET' && p==='/api/admin/audit'){const rows=db.prepare('SELECT id,actor,action,time,kind,target_id AS targetId,snapshot FROM audit ORDER BY time DESC LIMIT 500').all().map(r=>({...r,snapshot:r.snapshot?JSON.parse(r.snapshot):null}));return send(res,200,rows);}
      if(req.method==='GET' && p==='/api/admin/subscribers') return send(res,200,db.prepare('SELECT id,email,consented_at AS consentedAt,active FROM subscribers ORDER BY consented_at DESC').all().map(x=>({...x,active:Boolean(x.active)})));
      if(req.method==='GET' && p==='/api/admin/users'){if(actor.role!=='admin')return send(res,403,{error:'權限不足'});return send(res,200,db.prepare('SELECT id,email,name,role,active FROM users ORDER BY name').all().map(cleanUser));}
      if(req.method==='POST' && p==='/api/admin/users'){if(actor.role!=='admin')return send(res,403,{error:'權限不足'});const b=await readJson(req);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email||'')||!b.name||!['admin','editor'].includes(b.role)||String(b.password||'').length<10)return send(res,400,{error:'帳號資料格式錯誤'});try{const id=randomUUID();const salt=randomBytes(16).toString('hex');const hash=`${salt}:${scryptSync(String(b.password),salt,64).toString('hex')}`;db.prepare('INSERT INTO users VALUES(?,?,?,?,1,?)').run(id,String(b.email).toLowerCase(),String(b.name),b.role,hash);audit(actor.email,'create','users',id);return send(res,201,{id,email:String(b.email).toLowerCase(),name:String(b.name),role:b.role,active:true});}catch{return send(res,409,{error:'Email 已存在'});}}
      const um=p.match(/^\/api\/admin\/users\/([^/]+)$/);
      if(um && req.method==='PUT'){if(actor.role!=='admin')return send(res,403,{error:'權限不足'});const old=db.prepare('SELECT * FROM users WHERE id=?').get(um[1]);if(!old)return send(res,404,{error:'找不到帳號'});const b=await readJson(req);const active='active'in b?Boolean(b.active):Boolean(old.active);const role=b.role||old.role;if(!['admin','editor'].includes(role))return send(res,400,{error:'角色錯誤'});if(old.id===actor.id&&!active)return send(res,400,{error:'不能停用自己的帳號'});if(old.role==='admin'&&(!active||role!=='admin')){const n=db.prepare("SELECT count(*) n FROM users WHERE role='admin' AND active=1").get().n;if(n<=1)return send(res,400,{error:'至少需要一位啟用中的管理員'});}let ph=old.password_hash;if(b.password!==undefined){if(String(b.password).length<10)return send(res,400,{error:'密碼至少 10 個字元'});const salt=randomBytes(16).toString('hex');ph=`${salt}:${scryptSync(String(b.password),salt,64).toString('hex')}`;}db.prepare('UPDATE users SET name=?,role=?,active=?,password_hash=? WHERE id=?').run(String(b.name||old.name),role,active?1:0,ph,old.id);audit(actor.email,'update','users',old.id);return send(res,200,cleanUser(db.prepare('SELECT * FROM users WHERE id=?').get(old.id)));}
      if(req.method==='POST' && p==='/api/admin/upload'){const b=await readJson(req,7_200_000);const raw=String(b.data||'').replace(/^data:[^;]+;base64,/,'');let data;try{data=Buffer.from(raw,'base64');}catch{return send(res,400,{error:'檔案格式錯誤'});}if(!data.length||data.length>5*1024*1024)return send(res,413,{error:'圖片上限為 5MB'});const signatures=[['image/jpeg','ffd8ff','jpg'],['image/png','89504e470d0a1a0a','png'],['image/webp','52494646','webp']];const match=signatures.find(([mime,hex])=>b.mime===mime&&data.subarray(0,hex.length/2).toString('hex')===hex);if(!match||(match[0]==='image/webp'&&data.subarray(8,12).toString()!=='WEBP'))return send(res,400,{error:'僅接受 JPEG、PNG 或 WebP 圖片'});const dir=join(PUBLIC_DIR,'uploads');mkdirSync(dir,{recursive:true});const name=`${randomUUID()}.${match[2]}`;writeFileSync(join(dir,name),data,{flag:'wx'});audit(actor.email,'upload','files',name);return send(res,201,{url:`/uploads/${name}`});}
      return send(res,404,{error:'Not found'});
    }
    if (p.startsWith('/api/')) return send(res,404,{error:'Not found'});
    serveStatic(req,res,p);
  } catch (error) { send(res,error.status||500,{error:error.status?error.message:'伺服器發生錯誤'}); }
});

server.listen(PORT,HOST,()=>console.log(`Mori association website: http://${HOST}:${PORT}`));
function close(){server.close(()=>{db.close();process.exit(0);});}
process.on('SIGTERM',close);process.on('SIGINT',close);
