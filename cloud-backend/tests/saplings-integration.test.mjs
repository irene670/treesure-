import {test} from 'node:test';
import assert from 'node:assert/strict';
const origin=process.env.SAPLING_QA_ORIGIN;
test('70 位客人集中保存，私人照片、去重、取消通知與完整匯出', {skip:!origin},async()=>{
 assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
 const call=async(path,{body,method='GET',cookie,originHeader=origin}={})=>{const res=await fetch(origin+path,{method,headers:{Origin:originHeader,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {res,data:res.headers.get('content-type')?.includes('json')?await res.json():await res.text()};};
 const auth=await fetch(origin+'/signin-with-chatgpt?return_to=/admin',{redirect:'manual'});const cookie=auth.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.ok(cookie);
 const {data:events,res:er}=await call('/api/saplings/events');assert.equal(er.status,200);const event=events[0];assert.ok(event);
 const payload={eventId:event.id,name:'本機驗證',email:'unused@example.com',phone:'',species:event.species[0],quantity:1,privacyConsent:true,notificationConsent:true};
 assert.equal((await call('/api/saplings/registrations',{body:payload,method:'POST',originHeader:'https://evil.example'})).res.status,403);
 assert.equal((await call('/api/admin/saplings/registrations')).res.status,401);
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';const stamp=Date.now(),receipts=[];
 try{
 for(let i=0;i<70;i++){const body={...payload,email:`mori-qa-${stamp}-${i}@example.com`,photo:{mime:'image/png',data:png}};const {res,data}=await call('/api/saplings/registrations',{body,method:'POST'});assert.equal(res.status,201,JSON.stringify(data));assert.ok(data.unsubscribeToken);receipts.push({...data,email:body.email});}
 const first=receipts[0];const duplicate=await call('/api/saplings/registrations',{body:{...payload,email:first.email.toUpperCase(),notificationConsent:false},method:'POST'});assert.equal(duplicate.data.id,first.id);assert.equal(duplicate.data.unsubscribeToken,undefined);
 const {data:rows,res}=await call('/api/admin/saplings/registrations',{cookie});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(rows.filter(r=>receipts.some(x=>x.id===r.id)).length,70);
 const privatePhoto=rows.find(x=>x.id===first.id).photo;assert.ok(privatePhoto);assert.equal((await call(privatePhoto)).res.status,401);assert.equal((await fetch(origin+privatePhoto,{headers:{Cookie:cookie}})).status,200);
 assert.equal((await call('/api/saplings/unsubscribe',{body:{token:first.unsubscribeToken},method:'POST'})).res.status,200);
 const updated=(await call('/api/admin/saplings/registrations',{cookie})).data;assert.equal(updated.find(x=>x.id===first.id).notificationActive,false);
 const exported=await call('/api/admin/saplings/export',{cookie});assert.equal(exported.res.status,200);assert.equal(exported.data.version,1);const records=exported.data.registrations.filter(r=>receipts.some(x=>x.id===r.id));assert.equal(records.length,70);assert.ok(records.every(r=>r.photo.data===png&&r.unsubscribeToken));
 const sub=await call('/api/subscribe',{body:{email:`newsletter-${stamp}@example.com`,consent:true},method:'POST'});assert.equal(sub.res.status,201);assert.ok(sub.data.unsubscribeToken);assert.equal((await call('/api/unsubscribe',{body:{token:sub.data.unsubscribeToken},method:'POST'})).res.status,200);
 }finally{for(const row of receipts){const deleted=await call('/api/admin/saplings/registrations/'+row.id,{cookie,method:'DELETE',originHeader:origin});assert.equal(deleted.res.status,200);}}
});
