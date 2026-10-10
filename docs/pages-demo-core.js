import {validateRegistration} from './registration-core.js?v=80f76838ae66';
import {handleSaplingRequest} from './saplings-core.js?v=80f76838ae66';
// Browser-local testing adapter. These checks model UI workflows, not server security.
const copy = value => structuredClone(value);
const id = () => crypto.randomUUID();
const fail = message => { throw new Error(message); };
const cleanUser = user => user ? Object.fromEntries(['id','email','name','role','active'].map(key => [key,user[key]])) : null;
const validEmail = email => typeof email === 'string' && email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const validUrl = value => !value || (typeof value === 'string' && /^https?:\/\//.test(value) && (()=>{try{const u=new URL(value);return !u.username&&!u.password;}catch{return false;}})());

export function createDemoState(content, hashes) {
  return {...copy(content), saplingEvents:copy(content.saplingEvents || []), saplingRegistrations:copy(content.saplingRegistrations || []), users:[
    {id:'admin-demo',email:'admin@mori.local',name:'示範管理員',role:'admin',active:true,passwordHash:hashes.admin},
    {id:'editor-demo',email:'editor@mori.local',name:'示範編輯者',role:'editor',active:true,passwordHash:hashes.editor}
  ],audit:[],subscribers:[],version:1};
}

export function handleDemoRequest(state, path, options={}, sessionId=null) {
  const method=options.method || 'GET', body=options.body || {};
  const user=state.users.find(u=>u.id===sessionId && u.active);
  const requireUser = (admin=false) => {if(!user) fail('請先登入');if(admin && user.role!=='admin') fail('權限不足');};
  const log=(action,kind=null,targetId=null,snapshot=null)=>state.audit.unshift({id:id(),actor:user?.email||'訪客（瀏覽器測試）',action,kind,targetId,snapshot:copy(snapshot),time:new Date().toISOString()});
  const content=published=>({settings:copy(state.settings),...Object.fromEntries(['posts','ledger','reports'].map(kind=>[kind,copy(state[kind].filter(row=>!row.deleted&&(!published||row.status==='published')))]))});
  if(path==='/api/content'&&method==='GET') return {result:content(true)};
  if(path==='/api/admin/me'&&method==='GET') return {result:{user:cleanUser(user)}};
  if(path==='/api/admin/login'&&method==='POST') {
    const found=state.users.find(u=>u.email===String(body.email||'').trim().toLowerCase()&&u.active&&u.passwordHash===body.passwordHash);
    if(!found) fail('Email 或密碼錯誤');
    state.audit.unshift({id:id(),actor:found.email,action:'login',kind:null,targetId:null,snapshot:null,time:new Date().toISOString()});
    return {result:{user:cleanUser(found)},sessionId:found.id};
  }
  if(path==='/api/admin/logout'&&method==='POST') {if(user) log('logout');return {result:{ok:true},sessionId:null};}
  const saplingResult=handleSaplingRequest(state,path,options,{user:cleanUser(user),log,now:options.now});
  if(saplingResult.handled)return {result:saplingResult.result};
  if(path==='/api/registrations'&&method==='POST'){const row=validateRegistration(body,state.posts);state.registrations??=[];const prior=state.registrations.find(x=>x.eventId===row.eventId&&x.email===row.email);if(prior)return {result:{id:prior.id,duplicate:true}};row.id=id();state.registrations.push(row);return {result:{id:row.id}};}
  if(path==='/api/subscribe'&&method==='POST') {
    const email=String(body.email||'').trim().toLowerCase();if(!validEmail(email)||body.consent!==true)fail('請提供有效 Email 並同意訂閱');
    let row=state.subscribers.find(s=>s.email===email);
    if(!row){row={id:id(),email,token:id(),active:true};state.subscribers.push(row);}
    row.active=true;row.consentedAt=new Date().toISOString();return {result:{ok:true,unsubscribeToken:row.token}};
  }
  if(path==='/api/unsubscribe'&&method==='POST') {const row=state.subscribers.find(s=>s.token===body.token);if(!row)fail('無效的取消訂閱連結');row.active=false;return {result:{ok:true}};}
  if(!path.startsWith('/api/admin/')) fail('找不到操作');
  requireUser();
  if(path==='/api/admin/content'&&method==='GET')return {result:content(false)};
  if(path==='/api/admin/audit'&&method==='GET')return {result:copy(state.audit.slice(0,500))};
  if(path==='/api/admin/registrations'&&method==='GET')return {result:copy(state.registrations||[])};
  if(path==='/api/admin/subscribers'&&method==='GET')return {result:copy(state.subscribers.map(({token,...row})=>row))};
  if(path==='/api/admin/settings'&&method==='PUT') {
    const next={...state.settings};for(const key of Object.keys(next))if(key in body)next[key]=String(body[key]??'');
    for(const key of ['lineUrl','instagramUrl','facebookUrl','groupUrl'])if(!validUrl(next[key]))fail('網址格式錯誤');
    log('update','settings','1',state.settings);state.settings=next;return {result:copy(next)};
  }
  if(path==='/api/admin/upload'&&method==='POST') {
    const raw=String(body.data||'');const types={'image/png':'iVBORw0KGgo','image/jpeg':'/9j/','image/webp':'UklGR'};
    if(!types[body.mime]||!raw.startsWith(types[body.mime]))fail('僅接受 JPEG、PNG 或 WebP 圖片');
    if(raw.length>7_000_000)fail('圖片上限為 5MB');
    log('upload','files',body.name);return {result:{url:`data:${body.mime};base64,${raw}`}};
  }
  const restore=path.match(/^\/api\/admin\/posts\/([^/]+)\/restore$/);
  if(restore&&method==='POST'){
    const revision=state.audit.find(r=>r.id===body.revisionId&&r.kind==='posts'&&r.targetId===restore[1]&&r.snapshot);
    if(!revision)fail('找不到修訂版本');
    const index=state.posts.findIndex(p=>p.id===restore[1]);if(index>=0)log('update','posts',restore[1],state.posts[index]);
    const post={...copy(revision.snapshot),id:restore[1],deleted:false};if(index>=0)state.posts[index]=post;else state.posts.push(post);
    log('restore','posts',post.id,post);return {result:copy(post)};
  }
  const route=path.match(/^\/api\/admin\/(posts|ledger|reports)(?:\/([^/]+))?$/);
  if(route){
    const [,kind,target]=route;const existing=state[kind].find(row=>row.id===target&&!row.deleted);
    if(target&&!existing)fail('找不到資料');
    if(method==='DELETE'&&existing){log('delete',kind,target,existing);existing.deleted=true;return {result:{ok:true}};}
    if((method==='POST'&&!target)||(method==='PUT'&&existing)){
      const fields={posts:['title','type','category','summary','body','image','date','location','registrationUrl','status','isDemo'],ledger:['date','type','category','amount','note','status','isDemo'],reports:['title','year','url','status','isDemo']}[kind];
      const next={...existing};for(const key of fields)if(key in body)next[key]=body[key];
      if(!['draft','published'].includes(next.status))fail('請選擇發布狀態');
      if(kind==='posts') {
        const textFields=['title','type','category','summary','body','image','date','location','registrationUrl','status'];
        if(textFields.some(k=>typeof next[k]!=='string')||!next.title.trim()||!['activity','story','news'].includes(next.type)||!validUrl(next.registrationUrl))fail('文章欄位格式錯誤');
      }
      if(kind==='ledger'&&(!validDate(next.date)||!['income','expense'].includes(next.type)||!next.category||!Number.isSafeInteger(next.amount)||next.amount<0||next.amount>1_000_000_000))fail('收支欄位格式錯誤');
      if(kind==='reports'&&(!next.title||!Number.isInteger(next.year)||next.year<1900||!validUrl(next.url)))fail('報告欄位格式錯誤');
      next.id=target||id();next.isDemo=Boolean(next.isDemo);log(existing?'update':'create',kind,next.id,existing||next);
      if(existing)Object.assign(existing,next);else state[kind].unshift(next);return {result:copy(next)};
    }
  }
  const usersRoute=path.match(/^\/api\/admin\/users(?:\/([^/]+))?$/);
  if(usersRoute){requireUser(true);const target=usersRoute[1];
    if(method==='GET'&&!target)return {result:state.users.map(cleanUser)};
    if(method==='POST'&&!target){
      const email=String(body.email||'').toLowerCase();if(!validEmail(email)||!body.name||!['admin','editor'].includes(body.role)||!body.passwordHash||body.passwordLength<10)fail('帳號資料格式錯誤');
      if(state.users.some(u=>u.email===email))fail('Email 已存在');
      const row={id:id(),email,name:body.name,role:body.role,active:true,passwordHash:body.passwordHash};state.users.push(row);log('create','users',row.id);return {result:cleanUser(row)};
    }
    if(method==='PUT'&&target){
      const old=state.users.find(u=>u.id===target);if(!old)fail('找不到帳號');
      const next={...old,name:body.name||old.name,role:body.role||old.role,active:'active'in body?Boolean(body.active):old.active};
      if(!['admin','editor'].includes(next.role))fail('角色錯誤');
      if(old.id===user.id&&!next.active)fail('不能停用自己的帳號');
      if(old.role==='admin'&&old.active&&(!next.active||next.role!=='admin')&&state.users.filter(u=>u.role==='admin'&&u.active).length<=1)fail('至少需要一位啟用中的管理員');
      if(body.passwordHash){if(body.passwordLength<10)fail('密碼至少 10 個字元');next.passwordHash=body.passwordHash;}
      Object.assign(old,next);log('update','users',old.id);return {result:cleanUser(old)};
    }
  }
  fail('找不到操作');
}

export function addMissingSeedPosts(state,initial){for(const row of initial.posts){if(!state.posts.some(p=>p.id===row.id))state.posts.push(copy(row));}state.saplingEvents??=[];state.saplingRegistrations??=[];for(const row of initial.saplingEvents||[]){if(!state.saplingEvents.some(event=>event.id===row.id))state.saplingEvents.push(copy(row));}return state;}
