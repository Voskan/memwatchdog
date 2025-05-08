/**
 * @file index.ts
 * @summary Public façade for **memwatchdog/core**
 *
 *  Exposes a high‑level, batteries‑included API that glues together:
 *
 *  • Native addon  — periodic slope detection + heap‑snapshot generation.
 *  • HeapSampler   — zero‑overhead GC‑driven sampling for Prometheus.
 *  • PrometheusExporter — `/metrics` HTTP endpoint (opt‑in).
 *  • AlertManagerClient — push leak alerts to Alertmanager.
 *
 *  Quick‑start
 *  -----------
 *  ```ts
 *  import { MemWatchdog } from '@memwatchdog/core';
 *
 *  const wd = MemWatchdog.start({
 *    prometheus : { port: 9469 },
 *    alert      : { url: 'http://am:9093', defaultLabels: { service: 'api' } },
 *    native     : { threshold: 2048 }      // bytes/ms
 *  });
 *
 *  wd.on('leak', info => {
 *    console.log('leak detected — snapshot:', info.snapshot);
 *  });
 *  ```
 */

import { join } from "node:path";
import { EventEmitter } from "node:events";
import { HeapSampler, HeapSample } from "./sampler";
import {
  PrometheusExporter,
  ExporterOptions as PrometheusOpts,
} from "./exporter";
import {
  AlertManagerClient,
  AlertManagerClientOptions as AMClientOpts,
} from "./alert";

/* eslint‑disable @typescript-eslint/no-var-requires */
const native: NativeAddon = require("node-gyp-build")(
  join(__dirname, "..", "..", "..", "native")
);

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface NativeOptions {
  /** Sampling period (ms). Default 60 000. */
  interval?: number;
  /** Sliding‑window size for slope regression. Default 30. */
  window?: number;
  /** Threshold (bytes/ms) to trigger alert. Default 1024. */
  threshold?: number;
}

export interface MemWatchdogOptions {
  /** Native core behaviour. */
  native?: NativeOptions;
  /** Prometheus exporter settings (omit to disable). */
  prometheus?: PrometheusOpts | false;
  /** Alertmanager client settings (omit to disable). */
  alert?: AMClientOpts | false;
  /**
   * Attach a user‑defined callback fired when watchdog detects leak.
   * Same semantics as `'leak'` event.
   */
  onLeak?: (info: LeakInfo) => void;
}

/**
 * Data delivered on `'leak'` events.
 */
export interface LeakInfo {
  slope: number; // bytes / ms
  snapshot: string; // path to .heapsnapshot
}

/* --- internal shape of native addon ------------------------------------- */
interface NativeAddon {
  start(opts: {
    interval: number;
    window: number;
    threshold: number;
    cb: (slope: number, snapshot: string) => void;
  }): unknown; // opaque handle
  stop(handle: unknown): void;
}

/* -------------------------------------------------------------------------- */
/*  MemWatchdog implementation                                                */
/* -------------------------------------------------------------------------- */

export class MemWatchdog extends EventEmitter {
  /* ----- Singleton façade (one per process) ----------------------------- */
  private static instance: MemWatchdog | undefined;

  static start(opts: MemWatchdogOptions = {}): MemWatchdog {
    if (!this.instance) this.instance = new MemWatchdog(opts);
    return this.instance;
  }

  /** Idempotent stop — shuts down addons, exporter, sampler. */
  static stop(): void {
    this.instance?.shutdown();
    this.instance = undefined;
  }

  /* ----------------------- instance fields ------------------------------ */

  private readonly sampler: HeapSampler;
  private exporter?: ReturnType<typeof PrometheusExporter.start>;
  private readonly amClient?: AlertManagerClient | undefined;
  private readonly nativeHandle: unknown;

  private constructor(private readonly opts: MemWatchdogOptions) {
    super();

    /* ---------- Prometheus exporter (optional) -------------------------- */
    if (opts.prometheus !== false) {
      this.exporter = PrometheusExporter.start(opts.prometheus ?? {});
    }

    /* ---------- Alertmanager client (optional) -------------------------- */
    this.amClient =
      opts.alert === false
        ? undefined
        : new AlertManagerClient(
            opts.alert ?? { url: "http://localhost:9093" }
          );

    /* ---------- Heap‑sampler for metrics -------------------------------- */
    this.sampler = new HeapSampler();
    this.sampler.on("sample", (s) => this.onSample(s));
    this.sampler.start();

    /* ---------- Native core -------------------------------------------- */
    const nOpts = opts.native ?? {};
    this.nativeHandle = native.start({
      interval: nOpts.interval ?? 60_000,
      window: nOpts.window ?? 30,
      threshold: nOpts.threshold ?? 1024,
      cb: (slope: number, snapshot: string) => {
        this.onLeak({ slope, snapshot });
      },
    });
  }

  /* ----------------------- event handlers ------------------------------- */

  private onSample(s: HeapSample): void {
    this.exporter?.setHeapUsed(s.heapUsed);
    // The slope metric is updated by native slope‑computation callback (see below)
  }

  private async onLeak(info: LeakInfo): Promise<void> {
    /* Update metrics */
    this.exporter?.incAlerts?.();
    this.exporter?.setSlope?.(info.slope);

    /* Fire user callback / event */
    this.emit("leak", info);
    this.opts.onLeak?.(info);

    /* Push to Alertmanager (best‑effort) */
    if (this.amClient) {
      void this.amClient.fire({
        slope: info.slope,
        snapshot: info.snapshot,
      });
    }
  }

  /* ----------------------- shutdown ------------------------------------- */

  private shutdown(): void {
    native.stop(this.nativeHandle);
    this.sampler.stop();
    this.exporter?.stop();
    this.removeAllListeners();
  }
}

/* -------------------------------------------------------------------------- */
/*  Re‑exports for power‑users                                               */
/* -------------------------------------------------------------------------- */

export {
  HeapSampler,
  PrometheusExporter,
  AlertManagerClient,
  AMClientOpts,
  PrometheusOpts,
};
