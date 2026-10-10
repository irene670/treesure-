const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RANGE_RE = /^(\d{2}):(\d{2})\s*[–-]\s*(\d{2}):(\d{2})$/;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const fail = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const cleanText = (value, max, required = false) => {
  if (typeof value !== "string") fail("欄位格式錯誤");
  const text = value.trim();
  if ((required && !text) || text.length > max) fail("欄位格式錯誤");
  return text;
};

const validDate = (value) => {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

function eventDeadline(event) {
  const endDate = event.endDate || event.date;
  let hour = 23;
  let minute = 59;
  if (event.time) {
    const match = event.time.match(TIME_RANGE_RE);
    if (!match) return null;
    hour = Number(match[3]);
    minute = Number(match[4]);
  }
  return new Date(`${endDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:59+08:00`);
}

/** @param {string|null} [forcedId] */
export function validateSaplingEvent(input, existing = {}, forcedId = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("活動欄位格式錯誤");
  const next = { ...existing };
  for (const key of ["id", "title", "date", "endDate", "time", "location", "species", "status", "registrationOpen", "isDemo", "description", "care", "solicitationNumber", "solicitationPeriod", "donationMode"]) {
    if (key in input) next[key] = input[key];
  }
  next.id = forcedId || cleanText(next.id || "", 100, true);
  if (!/^[a-z0-9][a-z0-9-]{1,99}$/.test(next.id)) fail("活動代碼格式錯誤");
  next.title = cleanText(next.title, 160, true);
  next.location = cleanText(next.location, 200, true);
  next.description = cleanText(next.description || "", 3000);
  next.care = cleanText(next.care || "", 3000);
  next.solicitationNumber = cleanText(next.solicitationNumber || "", 120);
  next.solicitationPeriod = cleanText(next.solicitationPeriod || "", 160);
  next.donationMode = next.donationMode || "disabled";
  if (!["onsite", "disabled"].includes(next.donationMode)) fail("樂捐方式格式錯誤");
  if (!validDate(next.date)) fail("活動日期格式錯誤");
  next.endDate = next.endDate ? cleanText(next.endDate, 10) : next.date;
  if (!validDate(next.endDate) || next.endDate < next.date) fail("活動結束日期格式錯誤");
  next.time = cleanText(next.time || "", 40);
  if (next.time) {
    const match = next.time.match(TIME_RANGE_RE);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3]) > 23 || Number(match[4]) > 59 || `${match[1]}:${match[2]}` >= `${match[3]}:${match[4]}`) fail("活動時間格式錯誤");
  }
  if (!Array.isArray(next.species) || next.species.length < 1 || next.species.length > 20) fail("請設定可領取的樹苗種類");
  next.species = [...new Set(next.species.map((item) => cleanText(item, 80, true)))];
  if (!["draft", "published"].includes(next.status)) fail("活動發布狀態錯誤");
  if (typeof next.registrationOpen !== "boolean") fail("活動登記狀態錯誤");
  next.isDemo = Boolean(next.isDemo);
  return next;
}

function decodePhoto(photo) {
  if (!photo || typeof photo !== "object" || Array.isArray(photo)) fail("照片格式錯誤");
  const mime = photo.mime;
  let data = typeof photo.data === "string" ? photo.data.trim() : "";
  if (!ALLOWED_IMAGE_TYPES.has(mime)) fail("照片只接受 JPEG、PNG 或 WebP");
  const prefix = `data:${mime};base64,`;
  if (data.startsWith(prefix)) data = data.slice(prefix.length);
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) fail("照片格式錯誤");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  } catch {
    fail("照片格式錯誤");
  }
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) fail("照片大小上限為 2MB");
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  const isWebp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if ((mime === "image/jpeg" && !isJpeg) || (mime === "image/png" && !isPng) || (mime === "image/webp" && !isWebp)) fail("照片內容與格式不符");
  return { mime, data, bytes };
}

export function validateSaplingRegistration(input, events, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("登記資料格式錯誤");
  const eventId = cleanText(input.eventId, 100, true);
  const event = events.find((row) => row.id === eventId);
  if (!event || event.status !== "published") fail("找不到這場樹苗活動", 404);
  if (!event.registrationOpen) fail("這場活動目前未開放登記");
  const deadline = eventDeadline(event);
  if (!deadline || now.getTime() > deadline.getTime()) fail("這場活動的登記時間已結束");
  const species = cleanText(input.species, 80, true);
  if (!event.species.includes(species)) fail("請選擇本場活動提供的樹苗");
  if (input.quantity !== 1) fail("每次登記限領一株樹苗");
  const name = cleanText(input.name, 100, true);
  const email = cleanText(input.email, 254, true).toLowerCase();
  if (!EMAIL_RE.test(email)) fail("請提供有效的 Email");
  const phone = input.phone === undefined || input.phone === null ? "" : cleanText(input.phone, 30);
  if (phone && !/^[0-9+()#\-\s]{6,30}$/.test(phone)) fail("電話格式錯誤");
  if (input.privacyConsent !== true) fail("請同意個人資料與活動通知說明");
  if (typeof input.notificationConsent !== "boolean") fail("請選擇是否接收後續活動通知");
  return {
    eventId,
    name,
    email,
    phone,
    species,
    quantity: 1,
    privacyConsent: true,
    notificationConsent: input.notificationConsent,
    notificationActive: input.notificationConsent,
    photo: input.photo ? decodePhoto(input.photo) : null,
    createdAt: now.toISOString(),
  };
}

export function publicSaplingEvent(event) {
  const result = {};
  for (const key of ["id", "title", "date", "endDate", "time", "location", "species", "description", "care", "registrationOpen", "isDemo", "solicitationNumber", "solicitationPeriod", "donationMode"]) {
    result[key] = structuredClone(event[key]);
  }
  return result;
}
