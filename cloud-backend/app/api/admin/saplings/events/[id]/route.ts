import {privateJson} from '@/lib/saplings-api';
import { validateSaplingEvent } from "@/lib/saplings-core.js";
import { assertAdminWriteOrigin, bindings, errorResponse, findEvent, requireAdmin, type SaplingEvent } from "@/lib/saplings-api";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    assertAdminWriteOrigin(request);
    const { id } = await context.params;
    const { db } = bindings();
    const existing = await findEvent(db, id);
    if (!existing) return privateJson({ error: "找不到活動" }, { status: 404 });
    const event = validateSaplingEvent(await request.json(), existing, existing.id) as SaplingEvent;
    await db.prepare("UPDATE sapling_events SET json = ? WHERE id = ?").bind(JSON.stringify(event), id).run();
    return privateJson(event);
  } catch (error) {
    return errorResponse(error);
  }
}
