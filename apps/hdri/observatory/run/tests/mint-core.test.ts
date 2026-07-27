import { describe, expect, it } from "vitest";
import type { IdentityRequest } from "@syrokomskyi/observatory-core";
import { planIdentityResolution } from "../mint/mint-core";

/**
 * WP12 cross-year identity fix. Reproduces the bug — resolving against ONLY the vault
 * registry re-mints a fresh canonical id for the published Q2 baseline (whose ids predate
 * the registry, so the registry is empty for them) — and proves the fix: seed from the local
 * asset_id_map and heal those identities into the registry so a later year stays stable.
 */

const req = (id: string, domain: string): IdentityRequest => ({ provisionalId: id, domain });

let seq = 0;
const mint = (): string => `canon-new-${++seq}`;

describe("planIdentityResolution (cross-year identity)", () => {
  it("reuses a pre-registry local-map canonical id instead of re-minting", () => {
    seq = 0;
    // Q2 published baseline: asset_id_map has canonical ids; the vault registry is EMPTY.
    const localMap = new Map([["da-a", "canon-q2-a"]]);
    const plan = planIdentityResolution({
      requests: [req("da-a", "a.de")],
      vaultRegistry: new Map(),
      localMap,
      localDomain: new Map([["da-a", "a.de"]]),
      firstSeenPeriod: new Map([["da-a", "2026-q2"]]),
      briefPeriod: "2026-q3",
      mintedAt: "2026-07-01T00:00:00.000Z",
      mint,
    });

    expect(plan.resolved.get("da-a")).toBe("canon-q2-a"); // reused, NOT re-minted
    expect(plan.minted).toBe(0);
    expect(plan.reused).toBe(1);
  });

  it("heals the pre-registry baseline into the registry with its true first-seen period", () => {
    seq = 0;
    const plan = planIdentityResolution({
      requests: [req("da-a", "a.de"), req("da-new", "new.de")],
      vaultRegistry: new Map(), // empty — Q2 predates the registry
      localMap: new Map([["da-a", "canon-q2-a"]]),
      localDomain: new Map([["da-a", "a.de"]]),
      firstSeenPeriod: new Map([["da-a", "2026-q2"]]),
      briefPeriod: "2026-q3",
      mintedAt: "2026-07-01T00:00:00.000Z",
      mint,
    });

    // Both the healed Q2 id and the fresh Q3 mint go to the registry.
    expect(plan.minted).toBe(1); // da-new
    expect(plan.backfilled).toBe(1); // da-a healed
    const byId = new Map(plan.toRegister.map((r) => [r.provisional_id, r]));
    expect(byId.get("da-a")).toMatchObject({
      canonical_id: "canon-q2-a",
      first_seen_period: "2026-q2", // true origin, not the current brief period
    });
    expect(byId.get("da-new")).toMatchObject({
      canonical_id: "canon-new-1",
      first_seen_period: "2026-q3",
    });
  });

  it("stays stable across a fresh next-year DB once the registry is healed", () => {
    seq = 0;
    // 2027: a brand-new DB, so the local map is EMPTY; the healed registry carries da-a.
    const healedRegistry = new Map([["da-a", "canon-q2-a"]]);
    const plan = planIdentityResolution({
      requests: [req("da-a", "a.de")],
      vaultRegistry: healedRegistry,
      localMap: new Map(), // fresh year, nothing local yet
      localDomain: new Map(),
      firstSeenPeriod: new Map(),
      briefPeriod: "2027-q1",
      mintedAt: "2027-01-01T00:00:00.000Z",
      mint,
    });

    expect(plan.resolved.get("da-a")).toBe("canon-q2-a"); // SAME id across the year boundary
    expect(plan.minted).toBe(0);
    expect(plan.toRegister).toHaveLength(0); // already durable — nothing to re-register
  });

  it("is idempotent: nothing new to register when the registry already carries everything", () => {
    seq = 0;
    const plan = planIdentityResolution({
      requests: [req("da-a", "a.de")],
      vaultRegistry: new Map([["da-a", "canon-q2-a"]]),
      localMap: new Map([["da-a", "canon-q2-a"]]),
      localDomain: new Map([["da-a", "a.de"]]),
      firstSeenPeriod: new Map([["da-a", "2026-q2"]]),
      briefPeriod: "2026-q4",
      mintedAt: "2026-10-01T00:00:00.000Z",
      mint,
    });
    expect(plan.minted).toBe(0);
    expect(plan.backfilled).toBe(0);
    expect(plan.toRegister).toHaveLength(0);
  });

  it("the registry (cross-year authority) wins a conflict with a divergent local map", () => {
    seq = 0;
    const plan = planIdentityResolution({
      requests: [req("da-a", "a.de")],
      vaultRegistry: new Map([["da-a", "canon-authoritative"]]),
      localMap: new Map([["da-a", "canon-divergent"]]),
      localDomain: new Map([["da-a", "a.de"]]),
      firstSeenPeriod: new Map([["da-a", "2026-q2"]]),
      briefPeriod: "2026-q3",
      mintedAt: "2026-07-01T00:00:00.000Z",
      mint,
    });
    expect(plan.resolved.get("da-a")).toBe("canon-authoritative");
    expect(plan.toRegister).toHaveLength(0); // already in the registry
  });
});
