/**
 * @file examples/basic.ts
 * @brief Minimal “hello‑world” for **memwatchdog**
 *
 *  Scenario
 *  --------
 *  • Spins up a toy workload that continuously allocates objects
 *    (simulated leak).  
 *  • Starts `MemWatchdog` with Prometheus exporter **and** Alertmanager disabled
 *    so you can run this on any machine without extra services.  
 *  • Prints a console banner when the native addon detects a leak and writes
 *    a `.heapsnapshot` into the current working directory.
 *
 *  How to run
 *  ----------
 *  ```bash
 *  # from repo root
 *  pnpm build         # compile packages
 *
 *  # expose gc so the sampler receives 'gc' events more often
 *  node --expose-gc dist/examples/basic.js
 *  ```
 *  Then open another terminal and:
 *  ```bash
 *  curl http://localhost:9469/metrics | grep memwatchdog
 *  ```
 */

import { MemWatchdog } from '@memwatchdog/core';

/* ------------------------------------------------------------------------- */
/*  1) Start watchdog                                                        */
/* ------------------------------------------------------------------------- */

MemWatchdog.start({
  native: {
    interval : 60_000,   // check slope every minute
    window   : 30,       // 30 samples for regression
    threshold: 2 * 1024  // 2 KiB/ms slope triggers alert
  },
  prometheus: { port: 9469 }, // /metrics endpoint
  alert: false                // disable Alertmanager in this example
}).on('leak', info => {
  console.warn(
    `🚨 Leak detected — slope ${info.slope.toFixed(0)} B/ms, snapshot ${info.snapshot}`
  );
});

/* ------------------------------------------------------------------------- */
/*  2) Simulate memory leak                                                  */
/* ------------------------------------------------------------------------- */

const leaky: unknown[] = [];

function leak() {
  // Allocate ~100 KiB every tick, never release — classic leak
  leaky.push(Buffer.alloc(100 * 1024));
}

// Allocate once per second
setInterval(() => {
  leak();
  // Force GC so the sampler has fresh data (only when --expose-gc)
  if (typeof global.gc === 'function') global.gc();
}, 1_000);

console.log('🔬  Leaky workload started. Waiting for MemWatchdog to trigger…');
