import { boundedJson, enforceRegistrationLimit, assertPublicWriteOrigin, bindings, errorResponse, optionsResponse, publicJson, randomToken } from "@/lib/saplings-api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    assertPublicWriteOrigin(request);
    const {db}=bindings();await enforceRegistrationLimit(db,request);
    const payload = await boundedJson(request) as { email?: unknown; consent?: unknown };
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email) || email.length > 254) return publicJson(request, { error: "請提供有效的 Email" }, { status: 400 });
    if (payload.consent !== true) return publicJson(request, { error: "請先同意接收活動消息" }, { status: 400 });

    const existing = await db.prepare("SELECT email, active FROM newsletter_subscribers WHERE email = ?")
      .bind(email).first<{ email: string; active: string }>();
    if (existing) {
      return publicJson(request, { ok: true, duplicate: true });
    }
    const token = randomToken();
    try {
      await db.prepare("INSERT INTO newsletter_subscribers (email, unsubscribe_token, consent_at, active) VALUES (?, ?, ?, '1')")
        .bind(email, token, new Date().toISOString()).run();
      return publicJson(request, { ok: true, duplicate: false, unsubscribeToken: token }, { status: 201 });
    } catch (error) {
      const duplicate = await db.prepare("SELECT email FROM newsletter_subscribers WHERE email = ?").bind(email).first();
      if (duplicate) return publicJson(request, { ok: true, duplicate: true });
      throw error;
    }
  } catch (error) {
    return errorResponse(error, request);
  }
}

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}
