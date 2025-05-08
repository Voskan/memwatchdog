/**
 * @file analyze.spec.ts
 * @brief Unit‑tests for `analyzeSnapshots()` diff‑logic
 *
 *  We **mock** heavy snapshot parsing (`loadSnapshot`) and feed two synthetic
 *  retainer‑maps to verify:
 *    • Correct classification: added / removed / grown.
 *    • Accurate Δbytes / Δcount values.
 *    • Sorting by |Δbytes| descending.
 */

import { describe, it, expect, vi } from "vitest";
import { analyzeSnapshots, DiffEntry } from "../src/analyze.js";

/* ---------------------------------------------------------------------- */
/*  Mock retainer‑maps                                                    */
/* ---------------------------------------------------------------------- */

import * as snapshotMod from "../src/snapshot.js";

type MapValue = { bytes: number; count: number };
type SnapMap = Map<string, MapValue>;

function m(entries: [string, MapValue][]): SnapMap {
  return new Map(entries);
}

const SNAP_A = m([
  ["Foo > Bar", { bytes: 1_000_000, count: 50 }],
  ["Baz", { bytes: 500_000, count: 20 }],
]);

const SNAP_B = m([
  ["Foo > Bar", { bytes: 2_500_000, count: 75 }], // grown
  ["Qux", { bytes: 300_000, count: 10 }], // added
]); // 'Baz' removed

vi.spyOn(snapshotMod, "loadSnapshot").mockImplementation(
  async (path: string) => {
    return path.includes("A") ? SNAP_A : SNAP_B;
  }
);

/* ---------------------------------------------------------------------- */
/*  Tests                                                                  */
/* ---------------------------------------------------------------------- */

describe("analyzeSnapshots()", () => {
  it("computes correct diff entries", async () => {
    const diff = await analyzeSnapshots(
      "fooA.heapsnapshot",
      "fooB.heapsnapshot"
    );

    // Helper to find entry by path
    const byPath = (p: string) =>
      diff.entries.find((e) => e.path.join(" > ") === p)!;

    /* ---- Foo > Bar (grown) ------------------------------------------- */
    const bar = byPath("Foo > Bar");
    expect(bar.type).toBe<"grown">("grown");
    expect(bar.bytes).toBe(1_500_000); // 2.5M – 1.0M
    expect(bar.count).toBe(25); // 75 – 50

    /* ---- Qux (added) -------------------------------------------------- */
    const qux = byPath("Qux");
    expect(qux.type).toBe<"added">("added");
    expect(qux.bytes).toBe(300_000);
    expect(qux.count).toBe(10);

    /* ---- Baz (removed) ------------------------------------------------ */
    const baz = byPath("Baz");
    expect(baz.type).toBe<"removed">("removed");
    expect(baz.bytes).toBe(-500_000);
    expect(baz.count).toBe(-20);

    /* ---- Sorting: Foo > Bar first (largest abs Δbytes) ---------------- */
    expect(diff.entries[0]).toBe(bar);

    /* ---- Totals ------------------------------------------------------- */
    expect(diff.totalBytes).toBe(1_300_000); // 1.5M + 300k - 500k
    expect(diff.totalCount).toBe(15); // 25 + 10 - 20
  });
});
