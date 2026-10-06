import {createDemoState,handleDemoRequest,addMissingSeedPosts} from './pages-demo-core.js?v=a964b627349b';

const DB_NAME='mori-pages-test-v1';
const STORE='demo';
let opened;
let initialPromise;
async function passwordHash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function database(){if(!opened)opened=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('無法使用瀏覽器儲存空間，請確認允許網站儲存資料。'));});return opened;}
async function seeded(){
  const response=await fetch('./demo-seed.json');if(!response.ok)throw new Error('無法載入測試資料');
  const content=await response.json();const hash=await passwordHash('MoriDemo2026!');return createDemoState(content,{admin:hash,editor:hash});
}
export async function demoApi(path,options={}){
  const db=await database();const initial=await (initialPromise ||= seeded());const body=options.body?structuredClone(options.body):{};
  if(typeof body==='object'&&typeof body.password==='string'){body.passwordHash=await passwordHash(body.password);body.passwordLength=body.password.length;delete body.password;}
  const session=sessionStorage.getItem('mori-demo-session');
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);const request=store.get('state');let out;
    request.onsuccess=()=>{try{const state=addMissingSeedPosts(request.result||initial,initial);out=handleDemoRequest(state,path,{...options,body},session);store.put(state,'state');}catch(error){tx.abort();reject(error);}};
    tx.oncomplete=()=>{if('sessionId'in out){if(out.sessionId)sessionStorage.setItem('mori-demo-session',out.sessionId);else sessionStorage.removeItem('mori-demo-session');}resolve(out.result);};
    tx.onerror=()=>reject(new Error('瀏覽器儲存失敗，請檢查可用空間。'));tx.onabort=()=>reject(new Error('操作未儲存，請再試一次。'));
  });
}
export async function resetDemo(){const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=resolve;tx.onerror=reject;});sessionStorage.removeItem('mori-demo-session');}
