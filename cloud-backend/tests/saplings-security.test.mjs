import assert from "node:assert/strict";
import { test } from "node:test";
import { isAdminEmail, resolvePublicOrigin } from "../lib/saplings-security.ts";

test("allows only the production Pages origin, local QA, and same origin", () => {
  const apiUrl = "https://saplings.example.test/api/saplings/registrations";
  assert.equal(resolvePublicOrigin(apiUrl, "https://irene670.github.io"), "https://irene670.github.io");
  assert.equal(resolvePublicOrigin(apiUrl, "http://127.0.0.1:4310"), "http://127.0.0.1:4310");
  assert.equal(resolvePublicOrigin(apiUrl, "https://saplings.example.test"), "https://saplings.example.test");
  assert.equal(resolvePublicOrigin(apiUrl, "https://evil.example"), null);
  assert.equal(resolvePublicOrigin(apiUrl, null), null);
});

test("admin authorization is fail-closed and case-insensitive", () => {
  assert.equal(isAdminEmail("owner@example.com", ""), false);
  assert.equal(isAdminEmail("Owner@Example.com", "staff@example.com, owner@example.com"), true);
  assert.equal(isAdminEmail("visitor@example.com", "staff@example.com, owner@example.com"), false);
});
