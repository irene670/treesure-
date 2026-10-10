import test from 'node:test';
import assert from 'node:assert/strict';
import {initialContent} from '../content-seed.mjs';
import {createDemoState, handleDemoRequest} from '../public/pages-demo-core.js';
import {handleSaplingRequest, validateSaplingEvent, validateSaplingRegistration} from '../public/saplings-core.js';

const now = new Date('2026-10-10T12:00:00+08:00');
const pixel = {mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII='};
const validBody = {eventId:'aozihdi-2026-10-11',name:'領苗測試',email:'TREE@example.com',phone:'0912-345-678',species:'羅漢松',quantity:1,privacyConsent:true,notificationConsent:true,photo:pixel};

test('樹苗活動設定驗證日期、樹種、狀態與樂捐模式', () => {
  const base=initialContent.saplingEvents[0];
  assert.equal(validateSaplingEvent(base).species[0],'羅漢松');
  for (const patch of [{date:'2026-02-30'},{endDate:'2026-10-10'},{species:[]},{status:'live'},{registrationOpen:'yes'},{time:'19:00–13:00'},{donationMode:'online'}]) {
    assert.throws(()=>validateSaplingEvent({...base,...patch}));
  }
});

test('領苗登記限制本場樹種、數量、同意欄位、截止時間及圖片格式', () => {
  const events=initialContent.saplingEvents;
  const row=validateSaplingRegistration(validBody,events,now);
  assert.equal(row.email,'tree@example.com');assert.equal(row.quantity,1);assert.equal(row.photo.mime,'image/png');
  for(const patch of [{species:'樟樹'},{quantity:2},{privacyConsent:false},{notificationConsent:'yes'},{email:'bad'},{phone:'hello'},{photo:{mime:'image/svg+xml',data:'PHN2Zz4='}},{photo:{mime:'image/jpeg',data:pixel.data}}]) {
    assert.throws(()=>validateSaplingRegistration({...validBody,...patch},events,now));
  }
  assert.throws(()=>validateSaplingRegistration(validBody,events,new Date('2026-10-11T19:01:00+08:00')),/結束/);
  assert.throws(()=>validateSaplingRegistration(validBody,[{...events[0],registrationOpen:false}],now),/未開放/);
  assert.throws(()=>validateSaplingRegistration(validBody,[{...events[0],status:'draft'}],now),/找不到/);
});

test('瀏覽器測試模式去重且不改通知同意，照片僅登入管理端可見', () => {
  const state=createDemoState(initialContent,{admin:'a',editor:'b'});
  const first=handleSaplingRequest(state,'/api/saplings/registrations',{method:'POST',body:validBody},{now,id:()=> 'r1',token:()=> 't1'}).result;
  const duplicate=handleSaplingRequest(state,'/api/saplings/registrations',{method:'POST',body:{...validBody,notificationConsent:false}},{now}).result;
  assert.deepEqual(duplicate,{id:'r1',duplicate:true,isDemo:true});
  assert.equal(state.saplingRegistrations[0].notificationConsent,true);
  assert.throws(()=>handleDemoRequest(state,'/api/admin/saplings/registrations'),/登入/);
  assert.equal(handleDemoRequest(state,'/api/saplings/events').result[0].photo,undefined);
  const admin=handleDemoRequest(state,'/api/admin/saplings/registrations',{},'editor-demo').result;
  assert.match(admin[0].photo,/^data:image\/png;base64,/);assert.equal(admin[0].eventTitle,'凹子底市集・小樹苗活動');
});

test('通知名單只包含主動同意且未取消者，取消後不再列入', () => {
  const state=createDemoState(initialContent,{admin:'a',editor:'b'});
  handleSaplingRequest(state,'/api/saplings/registrations',{method:'POST',body:{...validBody,photo:null}},{now,id:()=> 'r1',token:()=> 't1'});
  assert.equal(handleDemoRequest(state,'/api/admin/saplings/notification-recipients',{},'editor-demo').result.length,1);
  handleDemoRequest(state,'/api/saplings/unsubscribe',{method:'POST',body:{token:'t1'}});
  assert.equal(handleDemoRequest(state,'/api/admin/saplings/notification-recipients',{},'editor-demo').result.length,0);
});

test('後台可建立與更新樹苗活動，公開端只看已發布資料', () => {
  const state=createDemoState(initialContent,{admin:'a',editor:'b'});
  const draft={...initialContent.saplingEvents[0],id:'future-tree-day',title:'未來樹苗日',date:'2099-01-01',endDate:'2099-01-01',status:'draft'};
  handleDemoRequest(state,'/api/admin/saplings/events',{method:'POST',body:draft},'editor-demo');
  assert.equal(handleDemoRequest(state,'/api/saplings/events').result.some(row=>row.id==='future-tree-day'),false);
  handleDemoRequest(state,'/api/admin/saplings/events/future-tree-day',{method:'PUT',body:{status:'published'}},'editor-demo');
  assert.equal(handleDemoRequest(state,'/api/saplings/events').result.some(row=>row.id==='future-tree-day'),true);
});
