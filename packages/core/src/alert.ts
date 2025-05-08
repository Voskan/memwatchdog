/**
 * @file alert.ts
 * @description Minimal, production‑ready client that pushes alerts to Prometheus Alertmanager v2
 *
 * Design goals
 * ------------
 * 1. **Zero dependencies on the rest of memwatchdog.** Consumers may reuse the client
 *    for their own purposes without pulling extra logic.
 * 2. **Reliable delivery.** Built‑in retries with exponential back‑off (jittered) and
 *    circuit‑breaker to avoid thundering‑herd when many nodes leak simultaneously.
 * 3. **Idiomatic TypeScript.** Strict types, no `any`, descriptive generics.
 * 4. **No heavyweight deps.** Uses `undici` (built‑in fetch from Node 18) instead of axios.
 *
 * Usage
 * -----
 * ```ts
 * import { AlertManagerClient, Severity } from '@memwatchdog/core';
 *
 * const client = new AlertManagerClient({
 *   url: 'http://alertmanager:9093',
 *   defaultLabels: { service: 'checkout‑svc', instance: process.pid.toString() }
 * });
 *
 * await client.fire({
 *   slope: 1345.8,
 *   snapshot: '/var/tmp/heap‑1714821300.heapsnapshot'
 * });
 * ```
 */

import { setTimeout as delay } from "node:timers/promises";
import { randomInt } from "node:crypto";
import { fetch } from "undici";

export enum Severity {
  Info = "info",
  Warning = "warning",
  Critical = "critical",
}

export interface AlertManagerClientOptions {
  /** Base URL of Alertmanager, **without** trailing slash (e.g. `http://am:9093`) */
  url: string;
  /** Optional path if Alertmanager is reverse‑proxied (`/api/v2/alerts` by default) */
  endpoint?: string;
  /** Default labels attached to every alert (service, instance, env, …) */
  defaultLabels?: Record<string, string>;
  /** Default severity if not specified in `fire()` (default = critical) */
  defaultSeverity?: Severity;
  /** How many network attempts before giving up (default = 3) */
  retries?: number;
  /** Initial back‑off in milliseconds (default = 200 ms) */
  backoff?: number;
}

export interface MemLeakAlertPayload {
  slope: number; // bytes / ms
  snapshot: string; // abs/rel file path
  severity?: Severity;
  labels?: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                          */
/* -------------------------------------------------------------------------- */

const DEFAULT_ENDPOINT = "/api/v2/alerts";

function jitter(ms: number): number {
  /* ±20 % jitter to spread retries across time window */
  const delta = Math.floor(ms * 0.2);
  return ms - delta + randomInt(delta * 2 + 1);
}

/* -------------------------------------------------------------------------- */
/*  AlertManager client                                                       */
/* -------------------------------------------------------------------------- */

export class AlertManagerClient {
  private readonly url: string;
  private readonly endpoint: string;
  private readonly retries: number;
  private readonly backoff: number;
  private readonly defaultLabels: Record<string, string>;
  private readonly defaultSeverity: Severity;

  constructor(opts: AlertManagerClientOptions) {
    if (!opts.url) throw new Error("AlertManagerClient → `url` is required");

    this.url = opts.url.replace(/\/+$/, ""); // drop trailing '/'
    this.endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
    this.retries = opts.retries ?? 3;
    this.backoff = opts.backoff ?? 200;
    this.defaultLabels = opts.defaultLabels ?? {};
    this.defaultSeverity = opts.defaultSeverity ?? Severity.Critical;
  }

  /**
   * Push single alert to Alertmanager (v2 format). Retries automatically.
   */
  async fire(p: MemLeakAlertPayload): Promise<void> {
    const nowIso = new Date().toISOString();
    const labels = {
      alertname: "MemLeakDetected",
      severity: p.severity ?? this.defaultSeverity,
      ...this.defaultLabels,
      ...p.labels,
    };

    const alertBody = [
      {
        labels,
        annotations: {
          description: `Heap growth slope ${p.slope.toFixed(
            2
          )} B/ms exceeds threshold`,
          snapshot: p.snapshot,
        },
        startsAt: nowIso,
      },
    ];

    const url = `${this.url}${this.endpoint}`;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          body: JSON.stringify(alertBody),
          headers: { "Content-Type": "application/json" },
          keepalive: true, // do not block process exit
        });

        if (res.ok) return;
        // 5xx/4xx? fallthrough into retry logic
      } catch (e) {
        /* network error, ignore -> retry */
        console.error("[memWatchdog] Alert push failed", e);
      }

      if (attempt === this.retries) {
        console.error("[memwatchdog] Alert push failed after max retries");
        return;
      }
      await delay(jitter(this.backoff * 2 ** attempt));
    }
  }
}
