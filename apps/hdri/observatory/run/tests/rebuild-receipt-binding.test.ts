import { expect, test } from "vitest";
import { createRebuildReceipt, verifyRebuildReceiptBinding } from "../release/release-contract";
const receipt = () => createRebuildReceipt("a".repeat(64), "b".repeat(64), "c".repeat(64), "d".repeat(64),
  "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64), "2026-09-27T00:00:00Z", "2026-09-27T00:05:00Z");
test("matching receipt binds to the actual capsule and public manifest", () => {
  expect(verifyRebuildReceiptBinding(receipt(), "a".repeat(64), "d".repeat(64))).toEqual([]);
});
test("a matching old rebuild cannot certify a different current capsule", () => {
  expect(verifyRebuildReceiptBinding(receipt(), "2".repeat(64), "d".repeat(64))).toContain("rebuild_receipt_current_capsule_mismatch");
});
test("equal expected and rebuilt hashes cannot certify different publication bytes", () => {
  expect(verifyRebuildReceiptBinding(receipt(), "a".repeat(64), "2".repeat(64))).toContain("rebuild_receipt_current_public_manifest_mismatch");
});
test("receipt cannot complete before it started", () => {
  expect(verifyRebuildReceiptBinding({ ...receipt(), completedAt: "2026-09-26T00:00:00Z" }, "a".repeat(64), "d".repeat(64)))
    .toContain("rebuild_receipt_time_order_invalid");
});
