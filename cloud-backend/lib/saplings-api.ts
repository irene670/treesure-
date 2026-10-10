import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { publicSaplingEvent, validateSaplingEvent } from "@/lib/saplings-core.js";
import { isAdminEmail, resolvePublicOrigin } from "@/lib/saplings-security";

export type SaplingEvent = {
  id: string;
  title: string;
  date: string;
  endDate: string;
  time: string;
  location: string;
  species: string[];
  status: "draft" | "published";
  registrationOpen: boolean;
  isDemo: boolean;
  description: string;
  care: string;
  solicitationNumber: string;
  solicitationPeriod: string;
  donationMode: "onsite" | "disabled";
};

export type RegistrationJson = {
  name: string;
  email: string;
  phone: string;
  species: string;
  quantity: 1;
  privacyConsent: true;
  notificationConsent: boolean;
  notificationActive: boolean;
  photoMime: string | null;
};

export const INITIAL_EVENT = validateSaplingEvent({
  id: "aozihdi-2026-10-11",
  title: "凹子底市集・小樹苗活動",
  date: "2026-10-11",
  endDate: "2026-10-11",
  time: "13:00–19:00",
  location: "高雄市凹子底森林公園",
  species: ["羅漢松"],
  status: "published",
  registrationOpen: true,
  isDemo: false,
  description: "領一株小樹，種下一份對土地的關心。完成登記後，請向現場工作人員出示完成畫面領取樹苗。",
  care: "放在明亮通風處，保持土壤微濕且避免積水；根系長大後再換到排水良好的盆器。",
  solicitationNumber: "",
  solicitationPeriod: "",
  donationMode: "onsite",
}) as SaplingEvent;

export function bindings() {
  const current = env as Cloudflare.Env & { ADMIN_EMAILS?: string };
  if (!current.DB) throw new Error("D1 binding DB is unavailable");
  if (!current.BUCKET) throw new Error("R2 binding BUCKET is unavailable");
  return { db: current.DB, bucket: current.BUCKET, adminEmails: current.ADMIN_EMAILS ?? "" };
}

export async function seedInitialEvent(db: D1Database) {
  await db.prepare("INSERT OR IGNORE INTO sapling_events (id, json) VALUES (?, ?)")
    .bind(INITIAL_EVENT.id, JSON.stringify(INITIAL_EVENT)).run();
}

export async function listEvents(db: D1Database, publishedOnly = false): Promise<SaplingEvent[]> {
  await seedInitialEvent(db);
  const rows = await db.prepare("SELECT json FROM sapling_events ORDER BY id").all<{ json: string }>();
  const events = rows.results.map((row) => validateSaplingEvent(JSON.parse(row.json)) as SaplingEvent);
  return publishedOnly ? events.filter((event) => event.status === "published") : events;
}

export async function findEvent(db: D1Database, id: string, publishedOnly = false) {
  await seedInitialEvent(db);
  const row = await db.prepare("SELECT json FROM sapling_events WHERE id = ?").bind(id).first<{ json: string }>();
  if (!row) return null;
  const event = validateSaplingEvent(JSON.parse(row.json)) as SaplingEvent;
  return publishedOnly && event.status !== "published" ? null : event;
}

export function publicEvent(event: SaplingEvent) {
  return publicSaplingEvent(event);
}

export function allowedPublicOrigin(request: Request) {
  return resolvePublicOrigin(request.url, request.headers.get("origin"));
}

export function publicCorsHeaders(request: Request): Record<string, string> {
  const origin = allowedPublicOrigin(request);
  return origin && origin !== new URL(request.url).origin
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : {};
}

export function publicJson(request: Request, data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(publicCorsHeaders(request))) headers.set(key, value);
  return Response.json(data, { ...init, headers });
}

export function assertPublicWriteOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedPublicOrigin(request)) throw Object.assign(new Error("不允許的來源"), { status: 403 });
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json") {
    throw Object.assign(new Error("請使用 JSON 格式送出"), { status: 415 });
  }
}

export function optionsResponse(request: Request) {
  const origin = allowedPublicOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  const headers = new Headers(publicCorsHeaders(request));
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

export async function requireAdmin() {
  const { adminEmails } = bindings();
  const user = await getChatGPTUser();
  if (!user) throw Object.assign(new Error("請先登入"), { status: 401 });
  if (!isAdminEmail(user.email, adminEmails)) throw Object.assign(new Error("此帳號沒有管理權限"), { status: 403 });
  return user;
}

export function assertAdminMutationOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw Object.assign(new Error("不允許的來源"), { status: 403 });
  }
}

export function assertAdminWriteOrigin(request: Request) {
  assertAdminMutationOrigin(request);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json") {
    throw Object.assign(new Error("請使用 JSON 格式送出"), { status: 415 });
  }
}

export function errorResponse(error: unknown, request?: Request) {
  const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 500;
  const message = status >= 500 ? "服務暫時無法使用，請稍後再試" : error instanceof Error ? error.message : "資料格式錯誤";
  return request ? publicJson(request, { error: message }, { status }) : Response.json({ error: message }, { status });
}

export function registrationAdminView(row: { id: string; event_id: string; json: string; photo_key: string | null; created_at: string }, eventTitle = "") {
  const data = JSON.parse(row.json) as RegistrationJson;
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: eventTitle || row.event_id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    species: data.species,
    quantity: 1,
    notificationConsent: data.notificationConsent,
    notificationActive: data.notificationActive,
    createdAt: row.created_at,
    photo: row.photo_key ? `/api/admin/saplings/photos/${encodeURIComponent(row.id)}` : null,
  };
}

export function randomToken(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes: Uint8Array) {
  let result = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    result += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(result);
}

export async function boundedJson(request:Request){
 const max=3*1024*1024;if(Number(request.headers.get('content-length')||0)>max)throw Object.assign(new Error('資料或照片太大，請縮小後再送出'),{status:413});
 const reader=request.body?.getReader();if(!reader)throw Object.assign(new Error('沒有登記資料'),{status:400});
 const chunks:Uint8Array[]=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Object.assign(new Error('資料或照片太大，請縮小後再送出'),{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(new Error('資料格式錯誤'),{status:400});}
}
export async function enforceRegistrationLimit(db:D1Database,request:Request){
 const ip=request.headers.get('cf-connecting-ip')||'local';const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));const key=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');const start=new Date(Math.floor(Date.now()/600000)*600000).toISOString();
 await db.prepare('DELETE FROM sapling_rate_limits WHERE window_start < ?').bind(new Date(Date.now()-3600000).toISOString()).run();
 const row=await db.prepare("INSERT INTO sapling_rate_limits (key, window_start, count) VALUES (?, ?, '1') ON CONFLICT(key, window_start) DO UPDATE SET count=CAST(count AS INTEGER)+1 RETURNING count").bind(key,start).first<{count:string}>();if(Number(row?.count)>600)throw Object.assign(new Error('目前登記較多，請稍候再試'),{status:429});
}

export function privateJson(data:unknown,init:ResponseInit={}){const headers=new Headers(init.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');return Response.json(data,{...init,headers});}
