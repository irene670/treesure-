import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root, dbPath, publicDir, appServer, base;

async function start() {
  if (!appServer) {
    process.env.PORT='0'; process.env.HOST='127.0.0.1'; process.env.MORI_DB_PATH=dbPath; process.env.MORI_PUBLIC_DIR=publicDir;
    appServer=(await import('../server.mjs')).server;
  } else {
    appServer.listen(0,'127.0.0.1');
  }
  if (!appServer.listening) await new Promise((resolveStart,reject)=>{appServer.once('listening',resolveStart);appServer.once('error',reject);});
  base=`http://127.0.0.1:${appServer.address().port}`;
}
async function stop() { if (!appServer?.listening) return; await new Promise(r=>appServer.close(r)); }
async function api(path, { method='GET', body, cookie, origin }={}) {
  const headers = {}; if(body!==undefined) headers['content-type']='application/json'; if(cookie) headers.cookie=cookie; if(origin) headers.origin=origin;
  const response=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json(); return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(email='admin@mori.local') { const r=await api('/api/admin/login',{method:'POST',body:{email,password:'MoriDemo2026!'}}); assert.equal(r.response.status,200); return r.cookie; }

test.before(async () => {
  root=mkdtempSync(join(tmpdir(),'mori-api-')); dbPath=join(root,'test.sqlite'); publicDir=join(root,'public'); mkdirSync(publicDir); writeFileSync(join(publicDir,'index.html'),'<!doctype html><title>Mori</title>'); await start();
});
test.after(async () => { await stop(); rmSync(root,{recursive:true,force:true}); });

test('公開內容只回傳已發布資料，深層路徑回傳首頁', async () => {
  const {response,data}=await api('/api/content'); assert.equal(response.status,200); assert.equal(data.settings.phone,'0973139328'); assert.ok(data.posts.every(x=>x.status==='published'));
  const page=await fetch(`${base}/activities/example`); assert.equal(page.status,200); assert.match(await page.text(),/Mori/); assert.equal(page.headers.get('x-frame-options'),'DENY');
});

test('管理 API 阻擋未登入請求', async () => {
  const r=await api('/api/admin/content'); assert.equal(r.response.status,401);
});

test('編輯者可直接發布，草稿不會出現在公開 API', async () => {
  const c=await login('editor@mori.local');
  const pub=await api('/api/admin/posts',{method:'POST',cookie:c,body:{title:'測試公開活動',type:'activity',category:'測試',summary:'',body:'',image:'',date:'',location:'',registrationUrl:'',status:'published',isDemo:true}}); assert.equal(pub.response.status,201);
  const draft=await api('/api/admin/posts',{method:'POST',cookie:c,body:{title:'測試草稿',type:'news',category:'測試',summary:'',body:'',image:'',date:'',location:'',registrationUrl:'',status:'draft',isDemo:true}}); assert.equal(draft.response.status,201);
  const visible=(await api('/api/content')).data.posts; assert.ok(visible.some(x=>x.id===pub.data.id)); assert.ok(!visible.some(x=>x.id===draft.data.id));
});

test('財務資料拒絕錯誤日期、類型與負數金額', async () => {
  const c=await login('editor@mori.local');
  const r=await api('/api/admin/ledger',{method:'POST',cookie:c,body:{date:'明天',type:'gift',category:'錯誤',amount:-1,note:'',status:'published',isDemo:true}}); assert.equal(r.response.status,400);
});

test('拒絕不存在的日期與非整數財務金額', async () => {
  const cookie=await login();
  for (const patch of [{date:'2026-02-30'},{date:'2026-99-99'},{amount:1.5},{amount:1_000_000_001}]) {
    const result=await api('/api/admin/ledger',{method:'POST',cookie,body:{date:'2026-10-06',type:'expense',category:'驗收',amount:100,note:'測試',status:'draft',isDemo:true,...patch}});
    assert.equal(result.response.status,400);
  }
});

test('私人 API 不快取且錯誤密碼無法登入', async () => {
  const result=await api('/api/admin/login',{method:'POST',body:{email:'admin@mori.local',password:'wrong-password'}});
  assert.equal(result.response.status,401);assert.equal(result.response.headers.get('cache-control'),'no-store');assert.equal(result.cookie,undefined);
});

test('圖片上傳驗證格式與權限', async () => {
  const cookie=await login();
  const payload={name:'pixel.png',mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII='};
  assert.equal((await api('/api/admin/upload',{method:'POST',body:payload})).response.status,401);
  assert.equal((await api('/api/admin/upload',{method:'POST',cookie,body:{...payload,mime:'image/jpeg'}})).response.status,400);
  const valid=await api('/api/admin/upload',{method:'POST',cookie,body:payload});assert.equal(valid.response.status,201);assert.match(valid.data.url,/^\/uploads\/.+\.png$/);
});

test('文章欄位與圖像網址拒絕非文字或危險內容', async () => {
  const cookie=await login();
  const payload={title:'驗收',type:'news',category:'驗收',summary:'',body:'',image:'',date:'',location:'',registrationUrl:'',status:'draft',isDemo:true};
  for(const patch of [{body:{}},{image:'javascript:alert(1)'}]) assert.equal((await api('/api/admin/posts',{method:'POST',cookie,body:{...payload,...patch}})).response.status,400);
});

test('訂閱去重並可取消訂閱', async () => {
  const first=await api('/api/subscribe',{method:'POST',body:{email:'Hello@Example.com',consent:true}}); assert.equal(first.response.status,200);
  const second=await api('/api/subscribe',{method:'POST',body:{email:'hello@example.com',consent:true}}); assert.equal(second.response.status,200); assert.equal(second.data.unsubscribeToken,first.data.unsubscribeToken);
  const unsub=await api('/api/unsubscribe',{method:'POST',body:{token:first.data.unsubscribeToken}}); assert.equal(unsub.response.status,200);
  const c=await login(); const rows=await api('/api/admin/subscribers',{cookie:c}); assert.equal(rows.data.filter(x=>x.email==='hello@example.com').length,1); assert.equal(rows.data.find(x=>x.email==='hello@example.com').active,false);
});

test('不同來源的狀態變更請求會被拒絕', async () => {
  const r=await api('/api/admin/login',{method:'POST',origin:'https://attacker.example',body:{email:'admin@mori.local',password:'MoriDemo2026!'}}); assert.equal(r.response.status,403);
});

test('管理員帳號保障：不能停用自己或移除最後一位管理員', async () => {
  const c=await login(); const me=(await api('/api/admin/me',{cookie:c})).data.user;
  const self=await api(`/api/admin/users/${me.id}`,{method:'PUT',cookie:c,body:{active:false}}); assert.equal(self.response.status,400);
  const demote=await api(`/api/admin/users/${me.id}`,{method:'PUT',cookie:c,body:{role:'editor'}}); assert.equal(demote.response.status,400);
});

test('修改內容與稽核修訂可跨伺服器重啟持久保存', async () => {
  let c=await login();
  const made=await api('/api/admin/posts',{method:'POST',cookie:c,body:{title:'持久化原稿',type:'story',category:'成果',summary:'',body:'原始內容',image:'',date:'',location:'',registrationUrl:'',status:'published',isDemo:true}});
  const changed=await api(`/api/admin/posts/${made.data.id}`,{method:'PUT',cookie:c,body:{body:'更新內容'}}); assert.equal(changed.response.status,200);
  const audit=await api('/api/admin/audit',{cookie:c}); const revision=audit.data.find(x=>x.action==='update'&&x.targetId===made.data.id); assert.equal(revision.snapshot.body,'原始內容');
  const restored=await api(`/api/admin/posts/${made.data.id}/restore`,{method:'POST',cookie:c,body:{revisionId:revision.id}}); assert.equal(restored.data.body,'原始內容');
  await stop(); await start(); c=await login();
  const all=await api('/api/admin/content',{cookie:c}); assert.equal(all.data.posts.find(x=>x.id===made.data.id).body,'原始內容');
});
