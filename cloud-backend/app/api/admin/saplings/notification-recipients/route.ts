import {privateJson} from '@/lib/saplings-api';
import { bindings, errorResponse, requireAdmin, type RegistrationJson } from "@/lib/saplings-api";

export async function GET() {
  try {
    await requireAdmin();
    const { db } = bindings();
    const rows = await db.prepare("SELECT json FROM sapling_registrations ORDER BY created_at DESC").all<{ json: string }>();
    const recipients = new Map<string, { email: string; name: string }>();
    for (const row of rows.results) {
      const data = JSON.parse(row.json) as RegistrationJson;
      if (data.notificationConsent && data.notificationActive && !recipients.has(data.email)) {
        recipients.set(data.email, { email: data.email, name: data.name });
      }
    }
    return privateJson([...recipients.values()]);
  } catch (error) {
    return errorResponse(error);
  }
}
