/**
 * @file watchdog.ts
 * @description Low‑level “engine” that wires the native addon to metrics / alerts
 *
 *  Why separate from `index.ts`?
 *  -----------------------------
 *  * `index.ts` exports the **high‑level** singleton API (`MemWatchdog`) that
 *    most applications call directly.
 *  * This file exposes a **re‑usable core** class (`Watchdog`) that you may embed
 *    in custom orchestration code, tests, or future plugins without pulling in
 *    the singleton logic/opinions.
 *
 *  Responsibilities
 *  ----------------
 *  • Start / stop the native N‑API addon.
 *  • Emit `'leak'` events with `{ slope, snapshot }`.
 *  • Optionally update Prometheus metrics and push Alertmanager alerts.
 *  • No heap sampling here — that is handled by `sampler.ts` at higher level.
 *
 *  Usage
 *  -----
 *  ```ts
 *  const exporter = PrometheusExporter.start();
 *  const am       = new AlertManagerClient({ url: 'http://am:9093' });
 *
 *  const wd = new Watchdog({ exporter, alertClient: am });
 *  wd.on('leak', info => console.warn('leak:', info));
 *  wd.start();
 *  ```
 */

import { EventEmitter } from "node:events";
import { join } from "node:path";
import { PrometheusExporter, ExporterOptions as PromOpts } from "./exporter.js";
import {
  AlertManagerClient,
  MemLeakAlertPayload,
  AlertManagerClientOptions,
} from "./alert.js";

/* eslint-disable @typescript-eslint/no-var-requires */
const native: NativeAddon = require("node-gyp-build")(
  join(__dirname, "..", "..", "..", "native")
);

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface NativeBehaviour {
  /** Sampling period (ms). Default 60000. */
  interval?: number;
  /** Regression window (samples). Default 30. */
  window?: number;
  /** Slope threshold (bytes/ms). Default 1024. */
  threshold?: number;
}

export interface WatchdogOptions {
  /** Native addon behaviour. */
  native?: NativeBehaviour;
  /** Prometheus exporter (existing instance) or opts to create. */
  exporter?: PrometheusExporter | PromOpts | false;
  /** Alertmanager client (existing instance) or opts to create. */
  alertClient?: AlertManagerClient | AlertManagerClientOptions | false;
}

export interface LeakInfo {
  slope: number;
  snapshot: string;
}

/* --- native addon façade -------------------------------------------------- */
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

export class Watchdog extends EventEmitter {
  private handle: unknown;
  private alertClient?: AlertManagerClient;
  private readonly nOpts: Required<NativeBehaviour>;

  constructor(readonly opts: WatchdogOptions = {}) {
    super();

    /* ---------- normalise options -------------------------------------- */

    this.nOpts = {
      interval: opts.native?.interval ?? 60_000,
      window: opts.native?.window ?? 30,
      threshold: opts.native?.threshold ?? 1024,
    };

    /* ---------- exporter ------------------------------------------------ */
    if (opts.exporter !== false) {
      PrometheusExporter.start(
        opts.exporter && opts.exporter !== true ? opts.exporter : {}
      );
    }

    /* ---------- Alertmanager ------------------------------------------- */
    if (opts.alertClient) {
      this.alertClient =
        opts.alertClient instanceof AlertManagerClient
          ? opts.alertClient
          : new AlertManagerClient(opts.alertClient);
    }
  }

  /* -------------------------------------------------------------------- */
  /*  Public control                                                      */
  /* -------------------------------------------------------------------- */

  /** Start the native addon (idempotent). */
  start(): void {
    if (this.handle) return; // already running
    this.handle = native.start({
      ...this.nOpts,
      cb: (slope: number, snapshot: string) => this.onLeak({ slope, snapshot }),
    });
  }

  /** Stop the addon & detach listeners. */
  stop(): void {
    if (!this.handle) return;
    native.stop(this.handle);
    this.handle = undefined;
    PrometheusExporter.stop();
    this.removeAllListeners();
  }

  /* -------------------------------------------------------------------- */
  /*  Leak handler                                                        */
  /* -------------------------------------------------------------------- */

  private async onLeak(info: LeakInfo): Promise<void> {
    /* Update metrics (if exporter present) */
    PrometheusExporter.incAlerts();
    PrometheusExporter.setSlope(info.slope);

    /* Fire JS event */
    this.emit("leak", info);

    /* Push Alertmanager (best‑effort async) */
    if (this.alertClient) {
      const payload: MemLeakAlertPayload = {
        slope: info.slope,
        snapshot: info.snapshot,
      };
      void this.alertClient.fire(payload);
    }
  }
}
