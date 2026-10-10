import {privateJson} from '@/lib/saplings-api';
import { assertAdminMutationOrigin, bindings, errorResponse, requireAdmin } from "@/lib/saplings-api";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    assertAdminMutationOrigin(request);
    const { id } = await context.params;
    const { db, bucket } = bindings();
    const row = await db.prepare("SELECT photo_key FROM sapling_registrations WHERE id = ?")
      .bind(id).first<{ photo_key: string | null }>();
    if (!row) return privateJson({ error: "找不到登記資料" }, { status: 404 });
    await db.prepare("DELETE FROM sapling_registrations WHERE id = ?").bind(id).run();
    if (row.photo_key) await bucket.delete(row.photo_key);
    return privateJson({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
