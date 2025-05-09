const { writeFileSync } = require("node:fs");

writeFileSync(
  "packages/core/dist/index.cjs",
  `module.exports = require('./index.js');\n`,
  "utf8"
);
