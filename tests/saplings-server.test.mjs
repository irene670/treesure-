import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

let root, child, base;
const pixel={mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII='};

async function api(path,{method='GET',body,cookie}={}){
  const headers={};if(body!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;
  const response=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {response,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}

test.before(async()=>{
  root=mkdtempSync(join(tmpdir(),'mori-saplings-'));const publicDir=join(root,'public');mkdirSync(publicDir);writeFileSync(join(publicDir,'index.html'),'<!doctype html>');
  const port=await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const value=probe.address().port;probe.close(error=>error?reject(error):resolve(value));});});
  base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,['server.mjs'],{cwd:join(import.meta.dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',MORI_DB_PATH:join(root,'test.sqlite'),MORI_PUBLIC_DIR:publicDir},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('測試伺服器啟動逾時')),5000);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`測試伺服器提前結束：${code}`));});child.stdout.on('data',chunk=>{if(String(chunk).includes('Mori association website')){clearTimeout(timer);resolve();}});});
});
test.after(async()=>{if(child&&!child.killed){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}rmSync(root,{recursive:true,force:true});});

test('伺服器保存私人領苗紀錄，公開 API 不洩漏照片，管理端才可讀取',async()=>{
  const login=await api('/api/admin/login',{method:'POST',body:{email:'editor@mori.local',password:'MoriDemo2026!'}});assert.equal(login.response.status,200);
  const event={id:'future-sapling-market',title:'未來樹苗市集',date:'2099-10-11',endDate:'2099-10-11',time:'13:00–19:00',location:'高雄',species:['羅漢松'],status:'published',registrationOpen:true,isDemo:false,description:'',care:'',solicitationNumber:'測試字號',solicitationPeriod:'測試期間',donationMode:'onsite'};
  assert.equal((await api('/api/admin/saplings/events',{method:'POST',cookie:login.cookie,body:event})).response.status,201);
  const publicEvents=await api('/api/saplings/events');assert.equal(publicEvents.data.some(row=>row.id===event.id),true);assert.equal(JSON.stringify(publicEvents.data).includes(pixel.data),false);
  const body={eventId:event.id,name:'王小樹',email:'TREE@example.com',phone:'0912345678',species:'羅漢松',quantity:1,privacyConsent:true,notificationConsent:true,photo:pixel};
  const first=await api('/api/saplings/registrations',{method:'POST',body});assert.equal(first.response.status,201);assert.equal(first.data.isDemo,false);assert.equal(first.data.duplicate,false);
  const duplicate=await api('/api/saplings/registrations',{method:'POST',body:{...body,notificationConsent:false}});assert.equal(duplicate.data.id,first.data.id);assert.equal(duplicate.data.unsubscribeToken,undefined);
  assert.equal((await api('/api/admin/saplings/registrations')).response.status,401);
  const registrations=await api('/api/admin/saplings/registrations',{cookie:login.cookie});assert.equal(registrations.data.length,1);assert.match(registrations.data[0].photo,/^data:image\/png;base64,/);assert.equal(registrations.data[0].notificationConsent,true);
  const recipients=await api('/api/admin/saplings/notification-recipients',{cookie:login.cookie});assert.deepEqual(recipients.data,[{email:'tree@example.com',name:'王小樹'}]);
  assert.equal((await api('/api/saplings/unsubscribe',{method:'POST',body:{token:first.data.unsubscribeToken}})).response.status,200);
  assert.deepEqual((await api('/api/admin/saplings/notification-recipients',{cookie:login.cookie})).data,[]);
});

test('伺服器拒絕錯誤樹種、數量、同意欄位與偽造圖片',async()=>{
  const baseBody={eventId:'future-sapling-market',name:'測試',email:'bad-case@example.com',species:'羅漢松',quantity:1,privacyConsent:true,notificationConsent:false};
  for(const patch of [{species:'樟樹'},{quantity:0},{privacyConsent:false},{notificationConsent:null},{photo:{mime:'image/png',data:'PHN2Zz4='}}]){
    const result=await api('/api/saplings/registrations',{method:'POST',body:{...baseBody,...patch}});assert.equal(result.response.status,400);
  }
});
