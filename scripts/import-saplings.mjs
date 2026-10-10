import {readFileSync,statSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {initializeDatabase} from '../seed.mjs';
import {validateSaplingEvent,validateSaplingRegistration} from '../public/saplings-core.js';
const token=value=>{if(typeof value!=='string'||!/^[a-fA-F0-9-]{24,128}$/.test(value))throw new Error('移轉檔的取消通知憑證格式錯誤');return value;};
const date=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('移轉檔的日期格式錯誤');return value;};
export function importSaplingArchive(db,input){
 if(input?.version!==1||!Array.isArray(input.events)||!Array.isArray(input.registrations))throw new Error('不支援的移轉檔格式');
 const events=input.events.map(e=>validateSaplingEvent(e));
 const registrations=input.registrations.map(raw=>{const event=events.find(e=>e.id===raw.eventId);if(!event)throw new Error('領取紀錄缺少活動資料');const row=validateSaplingRegistration(raw,[{...event,status:'published',registrationOpen:true}],new Date(`${event.date}T00:00:00+08:00`));if(typeof raw.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(raw.id))throw new Error('登記編號格式錯誤');if(typeof raw.notificationActive!=='boolean'||(raw.notificationActive&&!raw.notificationConsent))throw new Error('通知意願格式錯誤');return {...row,id:raw.id,createdAt:date(raw.createdAt),notificationActive:raw.notificationActive,unsubscribeToken:token(raw.unsubscribeToken)};});
 const subscribers=(input.subscribers||[]).map(raw=>{if(typeof raw.email!=='string'||!/^\S+@\S+\.\S+$/.test(raw.email)||raw.email.length>254||typeof raw.active!=='boolean')throw new Error('訂閱資料格式錯誤');return {...raw,email:raw.email.toLowerCase().trim(),unsubscribeToken:token(raw.unsubscribeToken),consentAt:date(raw.consentAt)};});
 let added=0,skipped=0,subscriptionAdded=0;
 db.exec('BEGIN');try{
 for(const event of events)db.prepare('INSERT INTO sapling_events(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(event.id,JSON.stringify(event));
 for(const row of registrations){const exists=db.prepare('SELECT id FROM sapling_registrations WHERE id=? OR (event_id=? AND email=?)').get(row.id,row.eventId,row.email);if(exists){skipped++;continue;}db.prepare('INSERT INTO sapling_registrations(id,event_id,email,unsubscribe_token,json) VALUES(?,?,?,?,?)').run(row.id,row.eventId,row.email,row.unsubscribeToken,JSON.stringify(row));added++;}
 for(const row of subscribers){if(db.prepare('SELECT id FROM subscribers WHERE email=?').get(row.email))continue;db.prepare('INSERT INTO subscribers(id,email,consented_at,active,token) VALUES(?,?,?,?,?)').run(randomUUID(),row.email,row.consentAt,row.active?1:0,row.unsubscribeToken);subscriptionAdded++;}
 db.exec('COMMIT');return {added,skipped,subscriptionAdded};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);const file=args[args.indexOf('--file')+1],dbPath=args[args.indexOf('--db')+1];if(!args.includes('--file')||!file||!args.includes('--db')||!dbPath)throw new Error('使用方式：node scripts/import-saplings.mjs --file 移轉檔.json --db 正式資料庫.sqlite');
 if(statSync(file).size>100*1024*1024)throw new Error('移轉檔超過 100MB，請分批匯入');const input=JSON.parse(readFileSync(file,'utf8'));const db=initializeDatabase(dbPath);try{console.log(JSON.stringify(importSaplingArchive(db,input)));}finally{db.close();}
}
