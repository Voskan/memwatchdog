# Node.JS Memory-Leak Detector 🛡️ MemWatchdog

**MemWatchdog is an open-source Node-JS Production‑grade memory-leak detector that exposes Prometheus metrics and sends Alertmanager alerts.**

- Prometheus metrics
- Alertmanager alerts
- Zero‑overhead GC sampling
- CLI diff‑tool

[![CI](https://github.com/Voskan/memwatchdog/actions/workflows/ci.yml/badge.svg)](https://github.com/Voskan/memwatchdog/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@memwatchdog/core)](https://www.npmjs.com/package/@memwatchdog/core)
[![license](https://img.shields.io/github/license/Voskan/memwatchdog)](LICENSE)

---

## ✨ Why MemWatchdog?

**MemWatchdog is the only Node-JS memory-leak detector that you can leave running in production 24 ⁄ 7**.  
Traditional profilers slow down the event loop and need manual SSH sessions; log-based heuristics tell you _after_ the container OOM-kills. MemWatchdog solves both problems:

1. **Zero-overhead sampling** – hooks into V8’s own _perf_hooks_ `gc` events; no timers, no async-hooks, < 2 % CPU.
2. **Actionable alerts, not graphs** – computes a linear-regression slope (bytes / ms) and fires when the heap grows abnormally fast, dumping an automatic `.heapsnapshot`.
3. **First-class observability** – ships a Prometheus exporter (`/metrics`) and pushes Alertmanager webhooks; one YAML line adds a Grafana dashboard.
4. **Native speed, cross-platform** – C++ N-API addon pre-compiled for Linux, macOS and Windows (x64 & arm64). No tool-chain required on install.
5. **CLI diff tool** – `mw analyze` compares two snapshots and highlights the retaining paths responsible for the leak—no Chrome DevTools juggling.
6. **Plug-and-play** – single `MemWatchdog.start()` call; PM2 and Docker side-car plugins mean zero code changes in legacy apps.

> Stop squinting at `heapUsed` graphs and start getting real leak reports with one line of code.

## ⚡ Quick start

### 1. Install memwatchdog/core

```bash
pnpm add @memwatchdog/core # yarn / npm work too
```

### 2. Embed into your service

```javascript
import { MemWatchdog } from "@memwatchdog/core";

MemWatchdog.start({
  native: { threshold: 2 * 1024 }, // 2 KiB/ms slope
  prometheus: { port: 9469 }, // /metrics
  alert: { url: "http://alertmanager:9093" },
});
```

### 3. Look at metrics

```bash
curl http://localhost:9469/metrics | grep memwatchdog
```

## 📈 Prometheus + Grafana

- Gauge `memwatchdog_heap_slope_bytes_per_ms`
- Counter `memwatchdog_leak_alert_total`

See [https://github.com/Voskan/memwatchdog/blob/main/docs/prometheus.md](docs/prometheus.md) for ready‑to‑paste alert rule and dashboard.

## 🔍 CLI

```bash
# Install once‑off
pnpm dlx @memwatchdog/cli analyze base.snap leak.snap

# Diff result
┌──────── Heap diff: base.snap → leak.snap ────────────────┐
│ ΔBytes   ΔCnt   T  Retainer Path                         │
│ +12.4 MiB +1024 >  FastifyInstance > routes > handler…   │
│ …                                                        │
└──────────────────────────────────────────────────────────┘
```

- `json` for machine‑readable output
- `out <file>` to save report

Full docs in [https://github.com/Voskan/memwatchdog/blob/main/docs/cli.md](docs/cli.md).

## 🧩 Plugins

| Package                                     | Description                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `@memwatchdog/cli`                          | CLI diff tool for heapsnapshots.                                       |
| _(coming soon)_ `@memwatchdog/pm2-plugin`   | Auto‑inject watchdog into every PM2/nodemon process – no code changes. |
| _(coming soon)_ `@memwatchdog/k8s‑sidecar`  | Distroless container exporting metrics & alerts for any Pod.           |
| _(coming soon)_ `@memwatchdog/s3`           | Off‑load snapshots to S3 (or any S3-compatible storage).               |
| _(coming soon)_ `@memwatchdog/vscode`       | VS Code extension to browse mw analyze output.                         |
| _(coming soon)_ `@memwatchdog/grafana`      | JSON provisioned dashboard with heap slope, alert count, sparkline.    |
| _(coming soon)_ `@memwatchdog/github-action | GitHub action to run `mw analyze` on PRs.                              |
| _(coming soon)_ `@memwatchdog/alertmanager` | Alertmanager webhook receiver for heap slope alerts.                   |

## 🛠 Architecture

- C++ N‑API addon
  - periodic heap‑stats -> linear regression slope
  - dumps Chrome‑formatted snapshots
- GC‑hook sampler (0 % overhead) updates `heap_used` gauge
- Coordinator glues metrics + Alertmanager
- Detailed diagrams -> [https://github.com/Voskan/memwatchdog/blob/main/docs/architecture.md](docs/architecture.md).

## 🚀 Roadmap

- Adaptive thresholds (statistical anomaly detection)
- VS Code extension to browse mw analyze output
- S3 snapshot off‑loader plugin

## 📝 Contributing

- `pnpm install`    # bootstrap mono‑repo
- `pnpm run build`   # compile TS & addon
- `pnpm run test`     # Vitest green? Great!
- Commit using Conventional Commits (`feat: ...`, `fix: ...`) – CI auto‑bumps versions.

## 🛡 Security

Heap‑snapshots may contain object data.
Store them on an encrypted volume or scrub secrets before sharing.

Report vulnerabilities → &lt;s-memwatchdog@voskanlabs.com> or [GitHub issues](https://github.com/Voskan/memwatchdog/issues).

---

<details>
<summary>License & Attribution</summary>

> © 2025 Voskan Labs, Inc. &nbsp; <https://voskanlabs.com>  
> License: MIT  
> Author: **Voskan Voskanyan** &lt;memwatchdog@voskanlabs.com>  
> Last updated: 2023-10-01  
> This document is part of the **MemWatchdog** project

</details>
