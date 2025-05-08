/**
 * @file ui.ts
 * @description Terminal renderer for `mw analyze` diffs
 *
 *  Renders a compact, colour‑coded table that highlights object‑retainer paths
 *  which grew between two heap‑snapshots. Designed to fit 80‑column terminals
 *  yet gracefully expand when width permits.
 *
 *  Table columns
 *  -------------
 *  • ΔBytes   — change in retained size (signed, human‑readable).
 *  • ΔCount   — change in object count (signed).
 *  • Type     — `+` (added), `-` (removed), `>` (grown).
 *  • Retainer Path — `Foo > Bar > baz` (most‑retaining → leaf).
 *
 *  Dependencies: `chalk` for colour, nothing else. Width detection via
 *  `process.stdout.columns` (fallback 80). Renders UTF‑8 box‑drawing characters
 *  when `TERM` supports, otherwise ASCII fallbacks.
 */

import chalk from "chalk";
import { stdout } from "node:process";

/* -------------------------------------------------------------------------- */
/*  Public types (mirror of analyze.ts)                                       */
/* -------------------------------------------------------------------------- */

export type DiffType = "added" | "removed" | "grown";

export interface DiffEntry {
  path: string[]; // retainer chain, root→leaf
  type: DiffType;
  bytes: number; // signed delta
  count: number; // signed delta
}

export interface HeapDiffResult {
  snapshotA: string;
  snapshotB: string;
  entries: DiffEntry[];
  totalBytes: number;
  totalCount: number;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Human‑readable bytes (KiB/MiB) with sign. */
function fmtBytes(n: number): string {
  const sign = n < 0 ? "-" : "+";
  const abs = Math.abs(n);
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 ** 2) return `${sign}${(abs / 1024).toFixed(1)} KiB`;
  return `${sign}${(abs / 1024 ** 2).toFixed(2)} MiB`;
}

/** ASCII fallback if UTF‑8 box‑drawing not supported. */
const BOX =
  process.env.TERM?.includes("UTF-8") || process.platform === "win32"
    ? {
        h: "─",
        v: "│",
        tl: "┌",
        tr: "┐",
        bl: "└",
        br: "┘",
        m: "┼",
        l: "├",
        r: "┤",
      }
    : {
        h: "-",
        v: "|",
        tl: "+",
        tr: "+",
        bl: "+",
        br: "+",
        m: "+",
        l: "+",
        r: "+",
      };

/* Select colour by diff‑type */
function colour(type: DiffType, str: string): string {
  switch (type) {
    case "added":
      return chalk.green(str);
    case "removed":
      return chalk.red(str);
    case "grown":
      return chalk.yellow(str);
  }
}

/* -------------------------------------------------------------------------- */
/*  Public render()                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Pretty‑print diff result to STDOUT.
 */
export function render(result: HeapDiffResult): void {
  const width = stdout.columns || 80;
  const colPad = 2;
  const colWidths = {
    bytes: 12,
    count: 8,
    type: 3,
    path: width - (12 + 8 + 3 + colPad * 3) - 4, // 4 for borders
  };

  // Header
  const hdrLine = `${BOX.tl}${BOX.h.repeat(width - 2)}${BOX.tr}`;
  const ftrLine = `${BOX.bl}${BOX.h.repeat(width - 2)}${BOX.br}`;
  console.log(hdrLine);
  const title = ` Heap diff: ${result.snapshotA} → ${result.snapshotB} `;
  const pad = Math.max(0, width - 2 - title.length);
  console.log(`${BOX.v}${title}${" ".repeat(pad)}${BOX.v}`);

  // Column titles
  const header =
    BOX.v +
    chalk.bold(" ΔBytes".padEnd(colWidths.bytes + colPad)) +
    chalk.bold(" ΔCnt".padEnd(colWidths.count + colPad)) +
    chalk.bold(" T ".padEnd(colWidths.type + colPad)) +
    chalk.bold("Retainer Path".padEnd(colWidths.path)) +
    BOX.v;
  console.log(header);
  console.log(`${BOX.l}${BOX.h.repeat(width - 2)}${BOX.r}`);

  // Rows
  result.entries.forEach((e) => {
    const row =
      BOX.v +
      colour(e.type, fmtBytes(e.bytes).padEnd(colWidths.bytes + colPad)) +
      colour(
        e.type,
        String(e.count >= 0 ? "+" + e.count : e.count).padEnd(
          colWidths.count + colPad
        )
      ) +
      colour(
        e.type,
        (e.type === "added" ? "+" : e.type === "removed" ? "-" : ">").padEnd(
          colWidths.type + colPad
        )
      ) +
      e.path.join(" > ").slice(0, colWidths.path).padEnd(colWidths.path) +
      BOX.v;
    console.log(row);
  });

  console.log(`${BOX.l}${BOX.h.repeat(width - 2)}${BOX.r}`);

  // Totals
  const totals =
    BOX.v +
    chalk.bold(fmtBytes(result.totalBytes).padEnd(colWidths.bytes + colPad)) +
    chalk.bold(
      (result.totalCount >= 0
        ? "+" + result.totalCount
        : String(result.totalCount)
      ).padEnd(colWidths.count + colPad)
    ) +
    " ".repeat(colWidths.type + colPad) +
    chalk.bold("TOTAL".padEnd(colWidths.path)) +
    BOX.v;
  console.log(totals);
  console.log(ftrLine);
}
