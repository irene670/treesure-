import { validateSaplingRegistration } from "@/lib/saplings-core.js";
import {
  boundedJson, enforceRegistrationLimit, assertPublicWriteOrigin,
  bindings,
  errorResponse,
  findEvent,
  optionsResponse,
  publicJson,
  randomToken,
  type RegistrationJson,
} from "@/lib/saplings-api";

type ExistingRow = { id: string };

export async function POST(request: Request) {
  let photoKey: string | null = null;
  try {
    assertPublicWriteOrigin(request);
    const { db, bucket } = bindings();
    await enforceRegistrationLimit(db,request);
    const input = await boundedJson(request);
    const eventId = typeof input === "object" && input && "eventId" in input ? String(input.eventId) : "";
    const event = await findEvent(db, eventId);
    const registration = validateSaplingRegistration(input, event ? [event] : []);

    const prior = await db.prepare("SELECT id FROM sapling_registrations WHERE event_id = ? AND email = ?")
      .bind(registration.eventId, registration.email).first<ExistingRow>();
    if (prior) return publicJson(request, { id: prior.id, duplicate: true, isDemo: false });

    const id = crypto.randomUUID();
    const unsubscribeToken = randomToken();
    if (registration.photo) {
      const extension = registration.photo.mime === "image/png" ? "png" : registration.photo.mime === "image/webp" ? "webp" : "jpg";
      photoKey = `saplings/${registration.eventId}/${crypto.randomUUID()}.${extension}`;
      await bucket.put(photoKey, registration.photo.bytes as Uint8Array, {
        httpMetadata: { contentType: registration.photo.mime, cacheControl: "private, no-store" },
      });
    }

    const stored: RegistrationJson = {
      name: registration.name,
      email: registration.email,
      phone: registration.phone,
      species: registration.species,
      quantity: 1,
      privacyConsent: true,
      notificationConsent: registration.notificationConsent,
      notificationActive: registration.notificationActive,
      photoMime: registration.photo?.mime ?? null,
    };

    try {
      await db.prepare(`
        INSERT INTO sapling_registrations
          (id, event_id, email, json, photo_key, unsubscribe_token, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, registration.eventId, registration.email, JSON.stringify(stored), photoKey, unsubscribeToken, registration.createdAt).run();
    } catch (error) {
      if (photoKey) await bucket.delete(photoKey);
      photoKey = null;
      const duplicate = await db.prepare("SELECT id FROM sapling_registrations WHERE event_id = ? AND email = ?")
        .bind(registration.eventId, registration.email).first<ExistingRow>();
      if (duplicate) return publicJson(request, { id: duplicate.id, duplicate: true, isDemo: false });
      throw error;
    }

    return publicJson(request, { id, duplicate: false, isDemo: false, unsubscribeToken }, { status: 201 });
  } catch (error) {
    if (photoKey) {
      try {
        await bindings().bucket.delete(photoKey);
      } catch {
        // The main error remains authoritative. A lifecycle rule can clear an orphan if storage is unavailable.
      }
    }
    return errorResponse(error, request);
  }
}

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}
