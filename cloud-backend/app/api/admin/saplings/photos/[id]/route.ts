import {privateJson} from '@/lib/saplings-api';
import { bindings, errorResponse, requireAdmin, type RegistrationJson } from "@/lib/saplings-api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const { db, bucket } = bindings();
    const row = await db.prepare("SELECT json, photo_key FROM sapling_registrations WHERE id = ?")
      .bind(id).first<{ json: string; photo_key: string | null }>();
    if (!row?.photo_key) return privateJson({ error: "找不到照片" }, { status: 404 });
    const object = await bucket.get(row.photo_key);
    if (!object) return privateJson({ error: "找不到照片" }, { status: 404 });
    const data = JSON.parse(row.json) as RegistrationJson;
    return new Response(object.body, {
      headers: {
        "Content-Type": data.photoMime || object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
