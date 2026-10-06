import test from 'node:test';
import assert from 'node:assert/strict';
import {initialContent} from '../content-seed.mjs';
import {createDemoState,handleDemoRequest} from '../public/pages-demo-core.js';
test('報名只開放已發布示範活動，名單須登入且重送不新增',()=>{
 const state=createDemoState(initialContent,{admin:'a',editor:'b'});
 const body={eventId:'demo-life-workshop',name:'測試',email:'TEST@example.com',count:2,consent:true};
 const first=handleDemoRequest(state,'/api/registrations',{method:'POST',body}).result;
 assert.equal(handleDemoRequest(state,'/api/registrations',{method:'POST',body}).result.id,first.id);
 assert.throws(()=>handleDemoRequest(state,'/api/admin/registrations'));
 const rows=handleDemoRequest(state,'/api/admin/registrations',{},'editor-demo').result;
 assert.equal(rows.length,1);assert.equal(rows[0].email,'test@example.com');
 for(const patch of [{eventId:'forest-fair-2026'},{count:0},{count:6},{consent:false},{email:'bad'}])assert.throws(()=>handleDemoRequest(state,'/api/registrations',{method:'POST',body:{...body,...patch}}));
 state.posts.find(x=>x.id===body.eventId).status='draft';assert.throws(()=>handleDemoRequest(state,'/api/registrations',{method:'POST',body}));
});
