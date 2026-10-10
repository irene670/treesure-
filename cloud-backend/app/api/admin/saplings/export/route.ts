import {
  bindings,
  bytesToBase64,
  errorResponse,
  listEvents,
  requireAdmin,
  type RegistrationJson,
} from "@/lib/saplings-api";

type ExportRow = {
  id: string;
  event_id: string;
  email: string;
  json: string;
  photo_key: string | null;
  unsubscribe_token: string;
  created_at: string;
};

export async function GET() {
  try {
    await requireAdmin();
    const { db, bucket } = bindings();
    const events = await listEvents(db);
    const rows = await db.prepare(`
      SELECT id, event_id, email, json, photo_key, unsubscribe_token, created_at
      FROM sapling_registrations
      ORDER BY created_at, id
    `).all<ExportRow>();
    const subscribers = await db.prepare(`
      SELECT email, unsubscribe_token, consent_at, active
      FROM newsletter_subscribers
      ORDER BY consent_at, email
    `).all<{ email: string; unsubscribe_token: string; consent_at: string; active: string }>();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`{"version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"events":${JSON.stringify(events)},"subscribers":${JSON.stringify(subscribers.results.map((row) => ({ email: row.email, unsubscribeToken: row.unsubscribe_token, consentAt: row.consent_at, active: row.active === "1" })))},"registrations":[`));
          for (let index = 0; index < rows.results.length; index += 1) {
            const row = rows.results[index];
            const data = JSON.parse(row.json) as RegistrationJson;
            let photo: { mime: string; data: string } | null = null;
            if (row.photo_key) {
              const object = await bucket.get(row.photo_key);
              if (!object) throw new Error(`Missing private photo for registration ${row.id}`);
              photo = {
                mime: data.photoMime || object.httpMetadata?.contentType || "application/octet-stream",
                data: bytesToBase64(new Uint8Array(await object.arrayBuffer())),
              };
            }
            const record = {
              id: row.id,
              eventId: row.event_id,
              ...data,
              unsubscribeToken: row.unsubscribe_token,
              createdAt: row.created_at,
              photo,
            };
            controller.enqueue(encoder.encode(`${index ? "," : ""}${JSON.stringify(record)}`));
          }
          controller.enqueue(encoder.encode("]}"));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="sapling-registrations-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
