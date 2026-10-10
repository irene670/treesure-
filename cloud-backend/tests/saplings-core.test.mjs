import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSaplingEvent, validateSaplingRegistration } from "../lib/saplings-core.js";

const event = validateSaplingEvent({
  id: "aozihdi-2026-10-11",
  title: "凹子底市集・小樹苗活動",
  date: "2026-10-11",
  time: "13:00–19:00",
  location: "高雄市凹子底森林公園",
  species: ["羅漢松"],
  status: "published",
  registrationOpen: true,
  isDemo: false,
});

function registration(overrides = {}) {
  return {
    eventId: event.id,
    name: "王小樹",
    email: "Tree@example.com",
    phone: "0912-345-678",
    species: "羅漢松",
    quantity: 1,
    privacyConsent: true,
    notificationConsent: true,
    ...overrides,
  };
}

test("normalizes the email used by the unique event/email identity", () => {
  const first = validateSaplingRegistration(registration(), [event], new Date("2026-10-10T12:00:00+08:00"));
  const second = validateSaplingRegistration(registration({ email: "tree@example.com" }), [event], new Date("2026-10-10T12:00:00+08:00"));
  assert.equal(first.email, second.email);
  assert.equal(first.email, "tree@example.com");
});

test("accepts a signature-checked PNG and returns decoded private bytes", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const result = validateSaplingRegistration(registration({ photo: { mime: "image/png", data: png.toString("base64") } }), [event], new Date("2026-10-10T12:00:00+08:00"));
  assert.equal(result.photo.mime, "image/png");
  assert.deepEqual([...result.photo.bytes], [...png]);
});

test("rejects a forged photo MIME type", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  assert.throws(
    () => validateSaplingRegistration(registration({ photo: { mime: "image/png", data: jpeg.toString("base64") } }), [event], new Date("2026-10-10T12:00:00+08:00")),
    /照片內容與格式不符/,
  );
});

test("rejects registration after the event end time", () => {
  assert.throws(
    () => validateSaplingRegistration(registration(), [event], new Date("2026-10-11T19:01:00+08:00")),
    /登記時間已結束/,
  );
});
