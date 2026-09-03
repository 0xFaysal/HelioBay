import assert from "node:assert/strict";
import test from "node:test";
import { withDemoAccount } from "../lib/credit/demo-account.ts";
import { seed } from "../lib/credit/seed.ts";
import type { Account } from "../types/index.ts";

const firebaseOwner: Account = {
  id: "firebase-owner-uid",
  name: "Faysal Ahmed",
  email: "faysalfahim8@gmail.com",
  role: "owner",
  demo: false,
};

test("provisions a Firebase owner for browser demo mutations", () => {
  const original = seed("2026-09-04T00:00:00.000Z");
  const result = withDemoAccount(original, firebaseOwner);

  assert.equal(original.users.some(user => user.id === firebaseOwner.id), false);
  assert.equal(result.users.find(user => user.id === firebaseOwner.id)?.email, firebaseOwner.email);
  assert.equal(result.wallets.find(wallet => wallet.userId === firebaseOwner.id)?.balanceMinor, 50_000);
  assert.equal(result.ledger.find(entry => entry.userId === firebaseOwner.id)?.amountMinor, 50_000);
});

test("does not duplicate an existing authenticated demo account", () => {
  const once = withDemoAccount(seed("2026-09-04T00:00:00.000Z"), firebaseOwner);
  const twice = withDemoAccount(once, firebaseOwner);

  assert.equal(twice, once);
  assert.equal(twice.users.filter(user => user.id === firebaseOwner.id).length, 1);
  assert.equal(twice.wallets.filter(wallet => wallet.userId === firebaseOwner.id).length, 1);
});
