/**
 * @file watchdog.spec.ts
 * @brief Verification of high‑level MemWatchdog behaviour
 *
 *  Covered scenarios
 *  -----------------
 *  1. MemWatchdog starts successfully with mocked native addon.
 *  2. When native core fires callback (`slope`, `snapshot`):
 *     • Emits `leak` event with identical payload.
 *     • Increments Prometheus counter and sets slope gauge.
 *  3. `MemWatchdog.stop()` cleans up between tests (idempotent).
 *
 *  Test runner: **Vitest** (fast, ESM‑friendly, TS‑first).
 *  Run via: `pnpm vitest run packages/core`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemWatchdog } from "../src";
import { PrometheusExporter } from "../src/exporter";

/* ---------------------------------------------------------------------- */
/*  Mock the native addon (node‑gyp‑build output)                          */
/* ---------------------------------------------------------------------- */

interface NativeMock {
  cb?: (slope: number, snapshot: string) => void;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}
const nativeMock: NativeMock = {
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock("node-gyp-build", () => {
  // node‑gyp‑build returns a factory → we return function providing addon obj
  return () => {
    nativeMock.start.mockImplementation(({ cb }) => {
      nativeMock.cb = cb; // save callback to trigger later
      return {}; // opaque handle
    });
    return nativeMock;
  };
});

/* ---------------------------------------------------------------------- */
/*  Tests                                                                  */
/* ---------------------------------------------------------------------- */

describe("MemWatchdog integration", () => {
  beforeEach(() => {
    // reset spies & exporter before each case
    nativeMock.start.mockClear();
    nativeMock.stop.mockClear();
    nativeMock.cb = undefined;
  });

  afterEach(() => {
    MemWatchdog.stop(); // idempotent cleanup
  });

  it('emits "leak" event and updates metrics when native detects leak', async () => {
    const leakSpy = vi.fn();

    // initialise Prometheus but disable default Node metrics to keep output small
    const exporter = PrometheusExporter.start({ defaultMetrics: false });

    // start watchdog without real Alertmanager
    const wd = MemWatchdog.start({ alert: false });
    wd.on("leak", leakSpy);

    // Simulate native slope breach
    expect(nativeMock.cb).toBeTypeOf("function");
    nativeMock.cb?.(5_000, "/tmp/test.heapsnapshot");

    // Microtask queue flush
    await vi.runAllTimersAsync();
    // ^ Vitest auto‑installs modern fake timers

    /* ------- Assertions ------------------------------------------------- */

    // 1) JS leak event bubbled
    expect(leakSpy).toHaveBeenCalledTimes(1);
    expect(leakSpy).toHaveBeenCalledWith({
      slope: 5_000,
      snapshot: "/tmp/test.heapsnapshot",
    });

    // 2) Prometheus metrics updated
    const metrics = await exporter["registry"].metrics();
    expect(metrics).toMatch(/memwatchdog_leak_alert_total\s+1/);
    expect(metrics).toMatch(/memwatchdog_heap_slope_bytes_per_ms\s+5000/);
  });
});
