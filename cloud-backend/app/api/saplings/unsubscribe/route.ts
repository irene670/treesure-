import { assertPublicWriteOrigin, bindings, errorResponse, optionsResponse, publicJson } from "@/lib/saplings-api";

export async function POST(request: Request) {
  try {
    assertPublicWriteOrigin(request);
    const payload = await request.json() as { token?: unknown };
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    if (!/^[a-f0-9]{64}$/.test(token)) return publicJson(request, { error: "無效的取消通知連結" }, { status: 404 });
    const { db } = bindings();
    const row = await db.prepare("SELECT id, json FROM sapling_registrations WHERE unsubscribe_token = ?")
      .bind(token).first<{ id: string; json: string }>();
    if (!row) return publicJson(request, { error: "無效的取消通知連結" }, { status: 404 });
    const data = JSON.parse(row.json) as Record<string, unknown>;
    data.notificationActive = false;
    await db.prepare("UPDATE sapling_registrations SET json = ? WHERE id = ?").bind(JSON.stringify(data), row.id).run();
    return publicJson(request, { ok: true });
  } catch (error) {
    return errorResponse(error, request);
  }
}

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}
