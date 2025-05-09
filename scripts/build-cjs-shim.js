const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { mkdirSync } = require("node:fs");

const distDir = join(process.cwd(), "dist");
mkdirSync(distDir, { recursive: true });

const shimPath = join(distDir, "index.cjs");
writeFileSync(shimPath, "module.exports = require('./index.js');\n", "utf8");

console.info("• CommonJS shim created →", shimPath);
