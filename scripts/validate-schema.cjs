const { spawnSync } = require("node:child_process");

const environment = { ...process.env };
environment.DATABASE_URL ||= "postgresql://validation:validation@127.0.0.1:5432/validation?schema=public";

const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "validate"], {
  stdio: "inherit",
  env: environment,
  shell: false,
});
process.exit(result.status ?? 1);
