import { assertPublicWriteOrigin, bindings, errorResponse, optionsResponse, publicJson } from "@/lib/saplings-api";

export async function POST(request: Request) {
  try {
    assertPublicWriteOrigin(request);
    const payload = await request.json() as { token?: unknown };
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    if (!/^[a-f0-9]{64}$/.test(token)) return publicJson(request, { error: "無效的取消訂閱連結" }, { status: 404 });
    const { db } = bindings();
    const result = await db.prepare("UPDATE newsletter_subscribers SET active = '0' WHERE unsubscribe_token = ?")
      .bind(token).run();
    if (!result.meta.changes) return publicJson(request, { error: "無效的取消訂閱連結" }, { status: 404 });
    return publicJson(request, { ok: true });
  } catch (error) {
    return errorResponse(error, request);
  }
}

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}
