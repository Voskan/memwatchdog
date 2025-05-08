# MemWatchdog CLI – Heap-Snapshot Diff Tool for Node Apps

The **CLI** complements the runtime watchdog with tooling for _offline analysis_
and quick inspections of `.heapsnapshot` files.

```bash
pnpm dlx @memwatchdog/cli@latest  # one‑off run
# or
pnpm add -D @memwatchdog/cli      # in project
```

## Commands & Options

| Command                                        | Description                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| **`mw analyze <baseline> <target> [options]`** | Diff two heap‑snapshots and print a coloured table (default) or JSON. |

### Global flags

| Flag           | Default | Description                                                            |
| -------------- | ------- | ---------------------------------------------------------------------- |
| `--json`       | _false_ | Output raw JSON (`HeapDiffResult`) instead of table-handy for scripts. |
| `--out <file>` | –       | Write result to file (text/JSON) rather than STDOUT.                   |
| `--limit <N>`  | 50      | Show only top N entries sorted by largest Δbytes.                      |
| `--version`    | –       | Print CLI version and exit.                                            |
| `-h, --help`   | –       | Show contextual help.                                                  |

## Typical workflow

### ➊ Capture snapshots

```javascript
import { MemWatchdog } from "@memwatchdog/core";

MemWatchdog.start({
  native: { threshold: 2 * 1024 }, // 2 KiB/ms slope
});
```

When the threshold is breached -> a file like `heap‑1714845324.heapsnapshot` appears in the CWD.

### ➋ Compare before/after

```bash
mw analyze baseline.heapsnapshot after‑2h.heapsnapshot
```

```bash
┌──────── Heap diff: baseline.heapsnapshot → after‑2h.heapsnapshot ─────────┐
│ ΔBytes     ΔCnt   T  Retainer Path                                        │
├───────────────────────────────────────────────────────────────────────────┤
│ +12.43 MiB +1024  >  FastifyInstance > routes > onRequest handlers        │
│ + 2.11 MiB +256   +  Buffer (internal)                                    │
│ - 0.98 MiB -128   -  detached ArrayBuffer                                 │
├───────────────────────────────────────────────────────────────────────────┤
│ +13.56 MiB +1152       TOTAL                                              │
└───────────────────────────────────────────────────────────────────────────┘
```

### ➌ Export JSON

```bash
mw analyze base.snap next.snap --json --out leak.json
cat leak.json | jq '.entries[0]'
```

## Automation ideas

| Use‑case            | How                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| **CI regression**   | Capture a snapshot after end‑to‑end tests, diff vs previous build; fail job if `totalBytes > 10 MiB`. |
| **Scheduled jobs**  | Cron a script that runs every night, diffs yesterday vs today, and sends Slack alerts.                |
| **IDE integration** | Use `--json` output to feed an extension that annotates source files with retaining objects.          |

## Exit codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | Success (diff produced, even if empty).                |
| `1`  | CLI misuse – wrong args / help requested.              |
| `2`  | Runtime error – file not found, invalid snapshot, etc. |

## Performance notes

- Parsing a 200 MB snapshot takes ≈ 1.5 s on Node 22 (M2 Pro).
- Memory overhead peaks at ~1.3× snapshot size (JSON parse + retain‑map).
- The diff algorithm itself is O(n) in #retainer paths, negligible compared to I/O.

## Troubleshooting

| Symptom                             | Fix                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `RangeError: Invalid string length` | Snapshot compressed? Ensure you pass original `.heapsnapshot`, not `.heapsnapshot.gz`. |
| Table misaligned / weird characters | Older terminal without UTF‑8 → set `TERM=` _or_ use `--json`.                          |
| Long parse times (> 10 s)           | Run on Node 20+ (faster JSON parser) and ensure disk isn’t throttled.                  |

<br/>

See also: [https://github.com/Voskan/memwatchdog/blob/main/docs/architecture.md](docs/architecture.md) for internals, [https://github.com/Voskan/memwatchdog/blob/main/docs/prometheus.md](docs/prometheus.md) for monitoring setup.

---

<details>
<summary>License & Attribution</summary>

> © 2025 Voskan Labs, Inc. &nbsp; <https://voskanlabs.com>  
> License: MIT  
> Author: **Voskan Voskanyan** &lt;voskan1989@gmail.com>  
> Last updated: 2023-10-01  
> This document is part of the **MemWatchdog** project

</details>
