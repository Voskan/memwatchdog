/**
 * @file sampler.ts
 * @description Zero‑overhead heap‑usage sampler built on Node `perf_hooks`
 *
 *  The sampler listens for `'gc'` performance entries emitted by V8 every time
 *  a garbage‑collection cycle finishes. At that moment the heap is in a stable
 *  state, therefore `process.memoryUsage().heapUsed` reflects the new “floor”.
 *
 *  Piggy‑backing on existing GC events avoids a dedicated timer‑interrupt and
 *  results in *effectively* zero additional overhead — the JS thread is woken
 *  up by V8 anyway to emit the PerformanceEntry.
 *
 *  API
 *  ---
 *  ```ts
 *  import { HeapSampler, HeapSample } from '@memwatchdog/core';
 *
 *  const sampler = new HeapSampler({ window: 60 });
 *  sampler.on('sample', s => console.debug('heap', s.heapUsed));
 *  sampler.start();
 *  ```
 */

import { EventEmitter } from "node:events";
import { PerformanceObserver } from "node:perf_hooks";

export interface HeapSample {
  /** Unix‑epoch, milliseconds */
  ts: number;
  /** Bytes currently used on the V8 heap */
  heapUsed: number;
}

export interface SamplerOptions {
  /** Circular‑buffer size, minimum = 3 (default = 30) */
  window?: number;
}

/* -------------------------------------------------------------------------- */
/*  HeapSampler implementation                                                */
/* -------------------------------------------------------------------------- */

export class HeapSampler extends EventEmitter {
  /** Latest window of samples (ordered oldest→newest) */
  private readonly buf: HeapSample[] = [];
  private readonly window: number;
  private readonly po: PerformanceObserver;
  private running = false;

  constructor(opts: SamplerOptions = {}) {
    super();
    this.window = Math.max(opts.window ?? 30, 3);

    /* GC entries are emitted *after* collection → safe to read heapUsed. */
    this.po = new PerformanceObserver(() => {
      if (!this.running) return;

      // We do not inspect entry.kind — a GC of any type is a good snapshot.
      const now = Date.now();
      const { heapUsed } = process.memoryUsage();
      this.pushSample({ ts: now, heapUsed });
    });

    // Observe all GC entry kinds (minor/major/idle etc.)
    this.po.observe({ entryTypes: ["gc"], buffered: false });
  }

  /* ------------ Public control helpers ---------------------------------- */

  /** Begin streaming samples (idempotent). */
  start(): void {
    this.running = true;
  }

  /** Stop streaming but keep observer attached (cheap). */
  stop(): void {
    this.running = false;
  }

  /** Return **copy** of current sample window (oldest→newest). */
  getSamples(): HeapSample[] {
    return this.buf.slice();
  }

  /** Latest sample or `undefined` if none collected yet. */
  last(): HeapSample | undefined {
    return this.buf[this.buf.length - 1];
  }

  /* ------------ Internals ------------------------------------------------ */

  private pushSample(s: HeapSample): void {
    if (this.buf.length === this.window) this.buf.shift();
    this.buf.push(s);
    this.emit("sample", s);
  }
}
