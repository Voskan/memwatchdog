# Monitor Node.JS Memory Leaks with Prometheus & MemWatchdog

1. Run your service with **memwatchdog** enabled.  
2. Scrape its `/metrics` endpoint.  
3. Import the ready‑made Grafana dashboard and copy the alert rule below.  

---

<br/>

## 1. Enable the Prometheus Exporter

```ts
import { MemWatchdog } from '@memwatchdog/core';

MemWatchdog.start({
  prometheus: {               // omit or set to false to disable entirely
    port : 9469,              // default 9469
    host : '0.0.0.0',         // bind address
    prefix: 'myapp_',         // optional metric prefix
    defaultMetrics: true      // expose Node default metrics (on by default)
  }
});
```

`MemWatchdog` will spin up a tiny HTTP server:

```bash
GET http://<host>:9469/metrics
```

If the port clashes with something else, just pick another.

<br/>

## 2. Service discovery

### Docker Compose

```yaml
  api:
    image: myapp:latest
    ports:
      - "3000:3000"
      - "9469:9469"  # expose for Prometheus
    labels:
      - "prometheus.job=api"
      - "prometheus.port=9469"
```

### Kubernetes
Add an annotation so Prometheus‑operator’s ServiceMonitor picks it up:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port:   "9469"
spec:
  ports:
    - name: http
      port: 3000
    - name: metrics
      port: 9469
```

<br/>

## 3. Exposed metrics

| Name (prefix omitted)                 | Type        | Description                                           |
| ------------------------------------- | ----------- | ----------------------------------------------------- |
| `memwatchdog_heap_used_bytes`         | **Gauge**   | Last sampled `heapUsed` from `process.memoryUsage()`. |
| `memwatchdog_heap_slope_bytes_per_ms` | **Gauge**   | Current heap‑growth trend (linear‑regression slope).  |
| `memwatchdog_leak_alert_total`        | **Counter** | How many native threshold breaches have occurred.     |

>Tip Use the slope gauge for dashboards; the built‑in counter tracks how many alerts actually fired.

<br/>

## 4. Alerting rule

A synchronous Alertmanager POST is already sent by the native addon when the slope exceeds its threshold. <br/>
Nevertheless, a Prometheus rule provides a second line of defence (e.g. if the process crashes before it can POST).


```yaml
groups:
  - name: memwatchdog
    rules:
      - alert: MemLeakDetected
        expr:  memwatchdog_heap_slope_bytes_per_ms > 1024
        for:   15m
        labels:
          severity: critical
        annotations:
          summary: "Heap is growing rapidly ({{ $value | humanize }}/ms)"
          description: |
            The Node.js process has been leaking memory for at least 15 minutes.
            Investigate the retaining paths via `mw analyze` on emitted snapshots.
          runbook: https://github.com/Voskan/memwatchdog/wiki/Heap-Leak-Runbook
```

Adjust the threshold (`1024 B/ms`) or `for:` duration to suit your workload.

<br/>

## 5. Grafana dashboard

1. **Import:** [`grafana/dashboards/memwatchdog.json`](grafana/dashboards/memwatchdog.json).

2. **Variables:**
   - `job` - Prometheus job label
   - `instance` - target instance

3. **Panels:**
   - Heap‑used sparkline with GC pauses overlay.
   - Heap‑slope gauge (red when above threshold).
   - Alerts table (links to runbook).

>Dashboard shows trends over 12 h by default; change the time‑range to zoom.

<br/>

## 6. Troubleshooting

| Symptom                                   | Fix                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| **`curl /metrics` → connection refused**  | Ensure exporter port is exposed / not blocked by firewall.                    |
| **Metrics all zero**                      | Did you call `MemWatchdog.start({ prometheus: … })` exactly once? Check logs. |
| **Multiple processes → “address in use”** | Run exporter only in one process (e.g. master in a `cluster`).                |
| **Heap‑slope always 0**                   | Likely no GC cycles ⇒ trigger with `--max-old-space-size` or wait longer.     |

<br/>

## 7. Security notes

- Exposed data is numeric only (no object contents).
- If snapshots contain sensitive data, store them on an encrypted volume and restrict Prometheus rules to trusted networks.
- TLS termination can be placed in front of the `/metrics` endpoint if required
(e.g. Envoy sidecar or Ingress controller).

<br/><br/>
That’s it — plug, deploy, watch the graphs. Happy monitoring! 🚀

---

<details>
<summary>License & Attribution</summary>

> © 2025 Voskan Labs, Inc. &nbsp; <https://voskanlabs.com>  
> License: MIT  
> Author: **Voskan Voskanyan** &lt;voskan1989@gmail.com>  
> Last updated: 2023-10-01  
> This document is part of the **MemWatchdog** project
</details>