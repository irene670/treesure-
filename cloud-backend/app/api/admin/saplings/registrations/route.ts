import {privateJson} from '@/lib/saplings-api';
import { bindings, errorResponse, listEvents, registrationAdminView, requireAdmin } from "@/lib/saplings-api";

type RegistrationRow = { id: string; event_id: string; json: string; photo_key: string | null; created_at: string };

export async function GET() {
  try {
    await requireAdmin();
    const { db } = bindings();
    const events = await listEvents(db);
    const titles = new Map(events.map((event) => [event.id, event.title]));
    const rows = await db.prepare(`
      SELECT id, event_id, json, photo_key, created_at
      FROM sapling_registrations
      ORDER BY created_at DESC, id DESC
    `).all<RegistrationRow>();
    return privateJson(rows.results.map((row) => registrationAdminView(row, titles.get(row.event_id))));
  } catch (error) {
    return errorResponse(error);
  }
}
