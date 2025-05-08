/**
 * @file pm2.config.js
 * @description PM2 process file demonstrating zero‑code integration of
 *              **memwatchdog** via the bundled PM2 module.
 *
 * How it works
 * ------------
 * 1. `@memwatchdog/pm2-plugin` is declared as an **ecosystem module**.  
 * 2. When PM2 spawns each app process, the plugin’s `onStart` hook automatically:
 *      • requires `@memwatchdog/core`  
 *      • calls `MemWatchdog.start()` with sensible defaults
 *      • exposes `/metrics` on port 9469 + <PM2 instance_id>
 *
 * You therefore **do not** need to modify application code — simply run:
 *
 *    pm2 start pm2.config.js
 *
 * Requirements
 * ------------
 *    pnpm add -g pm2                # or npm/yarn
 *    pnpm add -D @memwatchdog/pm2-plugin
 */

module.exports = {
  apps: [
    {
      name: 'api',
      script: './dist/server.js',
      // Pass any NODE_OPTIONS your service needs
      env: {
        NODE_ENV: 'production',
        // Example: expose GC so HeapSampler gets more frequent snapshots
        NODE_OPTIONS: '--expose-gc'
      }
    }
  ],

  /**
   * PM2 modules to launch alongside apps.
   *
   * `@memwatchdog/pm2-plugin` accepts optional ENV vars:
   *   • MW_INTERVAL    - sampling interval (ms).       (default 60000)
   *   • MW_WINDOW      - regression window size.       (default 30)
   *   • MW_THRESHOLD   - slope threshold (bytes/ms).   (default 1024)
   *   • MW_PROM_PORT   - base port for /metrics.       (default 9469)
   *   • MW_ALERT_URL   - Alertmanager base URL.        (optional)
   */
  modules: {
    '@memwatchdog/pm2-plugin': {
      // Example: lower threshold for dev to trigger sooner
      config: {
        MW_THRESHOLD: 512
      }
    }
  }
};
