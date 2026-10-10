import {privateJson} from '@/lib/saplings-api';
import { validateSaplingEvent } from "@/lib/saplings-core.js";
import { assertAdminWriteOrigin, bindings, errorResponse, listEvents, requireAdmin, seedInitialEvent, type SaplingEvent } from "@/lib/saplings-api";

export async function GET() {
  try {
    await requireAdmin();
    const { db } = bindings();
    return privateJson(await listEvents(db));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertAdminWriteOrigin(request);
    const event = validateSaplingEvent(await request.json()) as SaplingEvent;
    const { db } = bindings();
    await seedInitialEvent(db);
    const existing = await db.prepare("SELECT id FROM sapling_events WHERE id = ?").bind(event.id).first();
    if (existing) return privateJson({ error: "活動代碼已存在" }, { status: 409 });
    await db.prepare("INSERT INTO sapling_events (id, json) VALUES (?, ?)").bind(event.id, JSON.stringify(event)).run();
    return privateJson(event, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
