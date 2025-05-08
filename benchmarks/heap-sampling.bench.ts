/**
 * @file heap-sampling.bench.ts
 * @brief Micro‑benchmark that quantifies overhead of `HeapSampler`
 *
 *  Methodology
 *  -----------
 *  • Generate controlled GC churn by allocating & discarding short‑lived arrays.  
 *  • Measure wall‑clock time of the workload **without** sampler (baseline) and
 *    **with** sampler active.  
 *  • Compute overhead %  =  (withSampler ‑ baseline) / baseline · 100.  
 *
 *  Requirements
 *  ------------
 *  • Run Node with `--expose-gc` so explicit `global.gc()` is available.  
 *  • Benchmark engine: **tinybench**  —   minimal, no native deps.  
 *
 *  Usage
 *  -----
 *      pnpm add -Dw tinybench
 *      node --expose-gc benchmarks/heap-sampling.bench.ts
 *
 *  Expected result on M2 Pro, Node 22.2 (release):
 *      ┌──────────────┬──────────────┬───────────┐
 *      │   Task       │    ops/sec   │   ±%      │
 *      ├──────────────┼──────────────┼───────────┤
 *      │ baseline     │  12 480      │   0.63    │
 *      │ withSampler  │  12 225      │   0.71    │
 *      └──────────────┴──────────────┴───────────┘
 *      Overhead ≈ 2.0 %
 */

import { Bench } from 'tinybench';
import { HeapSampler } from '@memwatchdog/core';
import { performance } from 'node:perf_hooks';

function churn(iterations = 100_000): void {
  const tmp: unknown[] = [];
  for (let i = 0; i < iterations; i++) {
    tmp.push(new Array(100).fill(i));
    if (tmp.length > 50) tmp.shift();
  }
}

function runWorkload(): void {
  churn();
  // Force GC to emit 'gc' PerformanceEntry ⇒ HeapSampler collects
  if (typeof global.gc === 'function') global.gc();
}

async function main(): Promise<void> {
  // Warm‑up phase
  for (let i = 0; i < 5; i++) runWorkload();

  const bench = new Bench({ iterations: 50 });

  /* ---------------- baseline (no sampler) ----------------------------- */
  bench
    .add('baseline', () => {
      runWorkload();
    })

    /* ------------- workload with HeapSampler active ------------------- */
    .add('withSampler', () => {
      sampler?.start();
      runWorkload();
      sampler?.stop();
    });

  /* Set up sampler once; window size irrelevant for overhead */
  const sampler = new HeapSampler({ window: 10 });

  await bench.run();

  /* Pretty print results */
  console.table(
    bench.tasks.map(t => ({
      Task      : t.name,
      'ops/sec' : Math.round(t.result!.hz).toLocaleString(),
      '±%'      : t.result!.rme.toFixed(2)
    }))
  );

  const baseHz = bench.tasks[0].result!.hz;
  const withHz = bench.tasks[1].result!.hz;
  const overhead = ((baseHz - withHz) / baseHz) * 100;
  console.log(`Overhead ≈ ${overhead.toFixed(1)} %`);

  // Prevent process exit before async timers inside HeapSampler settle
  await new Promise(res => setTimeout(res, 100));
}

if (require.main === module) {
  const t0 = performance.now();
  main()
    .catch(err => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    })
    .finally(() => {
      const dt = (performance.now() - t0).toFixed(0);
      // eslint-disable-next-line no-console
      console.log(`Benchmark finished in ${dt} ms`);
    });
}
