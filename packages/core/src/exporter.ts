/**
 * @file exporter.ts
 * @description Tiny Prometheus exporter that surfaces memwatchdog metrics
 *
 *  Goals
 *  -----
 *  1. **No global state leaks.** A single exporter per process; subsequent
 *     `start()` calls are idempotent (return the same server instance).
 *  2. **Minimal footprint.** Only runtime dependency is `prom-client` —
 *     de‑facto standard for Node Prometheus metrics.
 *  3. **First‑class TypeScript.** Strict types, documented public surface.
 *
 *  Exposed metrics
 *  ---------------
 *  • `memwatchdog_heap_used_bytes`          — Gauge, last observed heapUsed.
 *  • `memwatchdog_heap_slope_bytes_per_ms`  — Gauge, current growth slope.
 *  • `memwatchdog_leak_alert_total`         — Counter, how many alerts sent.
 *
 *  Usage
 *  -----
 *  ```ts
 *  import { PrometheusExporter } from '@memwatchdog/core';
 *
 *  const exporter = PrometheusExporter.start({ port: 9469 });
 *
 *  // later in watchdog.tick():
 *  exporter.setHeapUsed(heapUsed);
 *  exporter.setSlope(slope);
 *  exporter.incAlerts();
 *  ```
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";

export interface ExporterOptions {
  /** Port to bind `/metrics` HTTP endpoint (default 9469). */
  port?: number;
  /** Bind address (default '0.0.0.0'). */
  host?: string;
  /**
   * Optional prefix for metric names, e.g. `myapp_`.
   * If provided, every metric will be exposed as `${prefix}memwatchdog_*`.
   */
  prefix?: string;
  /** Collect Node‑default metrics (gc, event‑loop, …), default = true. */
  defaultMetrics?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Singleton holder                                                          */
/* -------------------------------------------------------------------------- */

class _PrometheusExporterSingleton {
  private readonly registry: Registry;
  private readonly heapUsedGauge: Gauge<string>;
  private readonly slopeGauge: Gauge<string>;
  private readonly alertCounter: Counter<string>;
  private server?: ReturnType<typeof createServer>;
  private started = false;
  private readonly opts: Required<ExporterOptions>;

  constructor(opts: ExporterOptions = {}) {
    this.opts = {
      port: opts.port ?? 9469,
      host: opts.host ?? "0.0.0.0",
      prefix: opts.prefix ?? "",
      defaultMetrics: opts.defaultMetrics ?? true,
    };

    this.registry = new Registry();

    this.heapUsedGauge = new Gauge({
      name: `${this.opts.prefix}memwatchdog_heap_used_bytes`,
      help: "Last observed V8 heapUsed in bytes",
      registers: [this.registry],
    });

    this.slopeGauge = new Gauge({
      name: `${this.opts.prefix}memwatchdog_heap_slope_bytes_per_ms`,
      help: "Current heap growth trend in bytes/ms",
      registers: [this.registry],
    });

    this.alertCounter = new Counter({
      name: `${this.opts.prefix}memwatchdog_leak_alert_total`,
      help: "Total number of leak alerts pushed to Alertmanager",
      registers: [this.registry],
    });

    if (this.opts.defaultMetrics) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: this.opts.prefix,
      });
    }
  }

  /* ------------ Public API ---------------------------------------------- */

  /** Start `/metrics` HTTP endpoint (idempotent). */
  start(): this {
    if (this.started) return this;

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url !== "/metrics") {
        res.writeHead(404).end();
        return;
      }
      this.registry
        .metrics()
        .then((str) => {
          res.setHeader("Content-Type", this.registry.contentType);
          res.end(str);
        })
        .catch((err) => {
          res.writeHead(500).end(err.message);
        });
    }).listen(this.opts.port, this.opts.host);

    this.started = true;
    return this;
  }

  /** Close HTTP server (for graceful shutdown / tests). */
  stop(): void {
    this.server?.close();
    this.started = false;
  }

  /* ---------- Metric setters (thin wrappers) ---------------------------- */

  setHeapUsed(bytes: number): void {
    this.heapUsedGauge.set(bytes);
  }

  setSlope(bytesPerMs: number): void {
    this.slopeGauge.set(bytesPerMs);
  }

  incAlerts(count = 1): void {
    this.alertCounter.inc(count);
  }
}

/* -------------------------------------------------------------------------- */
/*  Exported façade                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Facade that hides singleton internals while exposing static helpers.
 * First `start()` creates the exporter; subsequent calls return the same ref.
 */
export class PrometheusExporter {
  private static instance: _PrometheusExporterSingleton | undefined;

  /** Initialise exporter (idempotent) and return instance for metric updates. */
  static start(opts: ExporterOptions = {}): _PrometheusExporterSingleton {
    if (!this.instance) {
      this.instance = new _PrometheusExporterSingleton(opts).start();
    }
    return this.instance;
  }

  static incAlerts(count = 1): void {
    this.instance?.incAlerts(count);
  }

  static setSlope(value: number): void {
    this.instance?.setSlope(value);
  }

  static setHeapUsed(bytes: number): void {
    this.instance?.setHeapUsed(bytes);
  }

  /** Stop and reset (useful in tests) */
  static stop(): void {
    this.instance?.stop();
    this.instance = undefined;
  }

  /** Convenient alias to fetch current Registry (throws if not started). */
  static registry(): Registry {
    if (!this.instance) throw new Error("PrometheusExporter not started yet");
    return this.instance["registry"];
  }
}
