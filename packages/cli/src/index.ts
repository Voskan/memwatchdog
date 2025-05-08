#!/usr/bin/env node
/**
 * @file index.ts
 * @description Entry‑point for **memwatchdog CLI** (`mw`)
 *
 *  Currently ships a single sub‑command:
 *  ------------------------------------------------------------------------
 *  • `mw analyze <baseline> <target> [options]`
 *      Diff two `.heapsnapshot` files and render coloured table or JSON.
 *
 *  Options
 *  -------
 *  --json           — print raw JSON (`HeapDiffResult`) to STDOUT.
 *  --out <file>     — write table/JSON to a file instead of STDOUT.
 *  --limit <N>      — show only top N rows (largest Δbytes). Default = 50.
 *  --version        — print CLI version.
 *  -h, --help       — usage info.
 *
 *  Design choices
 *  --------------
 *  • Uses **commander** (tiny, zero deps) for argument parsing.
 *  • Keeps process exit‑codes predictable:
 *      0  — success, diff emitted (even if empty)
 *      1  — CLI misuse (bad args)
 *      2  — runtime error (cannot read file, invalid snapshot, …)
 *
 *  NOTE: In ESM‑only Node (≥ 20) commander must be imported dynamically
 *  to avoid costly top‑level load when CLI is required as library.
 */

import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";

import { analyzeSnapshots } from "./analyze.js";
import { render } from "./ui.js";
import chalk from "chalk";

const { Command } = await import("commander");
const pkg = (await import("../package.json", { assert: { type: "json" } }))
  .default;

const program = new Command()
  .name("mw")
  .description("memwatchdog CLI utilities")
  .version(pkg.version, "--version", "print version");

program
  .command("analyze")
  .description("Diff two .heapsnapshot files")
  .argument("<baseline>", "baseline snapshot (.heapsnapshot)")
  .argument("<target>", "snapshot to compare against baseline")
  .option("--json", "output raw JSON instead of table")
  .option("--out <file>", "write output to <file> rather than STDOUT")
  .option("--limit <N>", "show only top N rows (default 50)", parseInt)
  .action(async (baseline, target, opts) => {
    try {
      const diff = await analyzeSnapshots(resolve(baseline), resolve(target));

      // Optional entry limit
      if (opts.limit && Number.isFinite(opts.limit)) {
        diff.entries = diff.entries.slice(0, opts.limit);
      } else {
        diff.entries = diff.entries.slice(0, 50);
      }

      let output: string;
      if (opts.json) {
        output = JSON.stringify(diff, null, 2);
      } else {
        // Capture console output into string if writing to file
        const chunks: string[] = [];
        const log = console.log;
        console.log = (str = "") => {
          chunks.push(String(str));
        };
        render(diff);
        console.log = log;
        output = chunks.join("\n");
      }

      if (opts.out) {
        const stream = createWriteStream(opts.out, { encoding: "utf8" });
        await pipeline(async function* () {
          yield output;
        }, stream);
      } else {
        console.log(output);
      }

      process.exit(0);
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message ?? err}`));
      process.exit(2);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(`CLI error: ${err.message ?? err}`));
  process.exit(1);
});
