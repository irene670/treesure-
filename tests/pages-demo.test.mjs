import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialContent} from '../content-seed.mjs';
import {createDemoState,handleDemoRequest} from '../public/pages-demo-core.js';

const fresh=()=>createDemoState(initialContent,{admin:'test-admin-hash',editor:'test-editor-hash'});
const request=(state,path,body,session='editor-demo',method='POST')=>handleDemoRequest(state,path,{method,body},session).result;
const post={title:'Pages 測試',type:'news',category:'示範',summary:'測試摘要',body:'測試內容',date:'',location:'',registrationUrl:'',image:'',status:'draft',isDemo:true};

test('瀏覽器測試資料互相隔離且不修改原始資料',()=>{const a=fresh(),b=fresh();a.settings.name='測試者 A';assert.notEqual(a.settings.name,b.settings.name);assert.equal(initialContent.settings.name,b.settings.name);});
test('Pages 登入、權限及管理員保護',()=>{const state=fresh();assert.throws(()=>request(state,'/api/admin/login',{email:'admin@mori.local',passwordHash:'wrong'},null),/密碼/);const login=handleDemoRequest(state,'/api/admin/login',{method:'POST',body:{email:'admin@mori.local',passwordHash:'test-admin-hash'}});assert.equal(login.sessionId,'admin-demo');assert.throws(()=>request(state,'/api/admin/users',null,'editor-demo','GET'),/權限/);assert.throws(()=>request(state,'/api/admin/users/admin-demo',{active:false},'admin-demo','PUT'),/停用/);assert.throws(()=>request(state,'/api/admin/users/admin-demo',{role:'editor'},'admin-demo','PUT'),/管理員/);});
test('Pages 草稿隔離、直接發布、修訂與復原',()=>{const state=fresh();const made=request(state,'/api/admin/posts',post);assert.ok(!handleDemoRequest(state,'/api/content').result.posts.some(p=>p.id===made.id));request(state,`/api/admin/posts/${made.id}`,{status:'published'},'editor-demo','PUT');assert.ok(handleDemoRequest(state,'/api/content').result.posts.some(p=>p.id===made.id));request(state,`/api/admin/posts/${made.id}`,{body:'變更'},'editor-demo','PUT');const previous=state.audit.find(a=>a.targetId===made.id&&a.snapshot?.body==='測試內容');assert.equal(request(state,`/api/admin/posts/${made.id}/restore`,{revisionId:previous.id}).body,'測試內容');});
test('Pages 訂閱去重及取消',()=>{const state=fresh();const first=request(state,'/api/subscribe',{email:'demo@example.com',consent:true},null);request(state,'/api/subscribe',{email:'DEMO@example.com',consent:true},null);assert.equal(state.subscribers.length,1);request(state,'/api/unsubscribe',{token:first.unsubscribeToken},null);assert.equal(state.subscribers[0].active,false);});
test('Pages 圖像格式和財務欄位驗證',()=>{const state=fresh();assert.throws(()=>request(state,'/api/admin/upload',{mime:'image/jpeg',data:'invalid'}),/JPEG/);assert.throws(()=>request(state,'/api/admin/ledger',{date:'2026-02-30',type:'expense',category:'測試',amount:500,status:'published'}),/格式/);assert.throws(()=>request(state,'/api/admin/ledger',{date:'2026-10-06',type:'expense',category:'測試',amount:1.5,status:'published'}),/格式/);});

test('新版素材故事加入既有資料時保留編輯內容與刪除狀態',async()=>{
 const {addMissingSeedPosts}=await import('../public/pages-demo-core.js');
 const state={posts:[{id:'existing',title:'自訂文字'},{id:'deleted',deleted:true}]};
 const initial={posts:[{id:'existing',title:'預設文字'},{id:'deleted',title:'預設文字'},{id:'new-story',title:'新增故事'}]};
 addMissingSeedPosts(state,initial);addMissingSeedPosts(state,initial);
 assert.equal(state.posts.length,3);assert.equal(state.posts[0].title,'自訂文字');assert.equal(state.posts[1].deleted,true);
});
