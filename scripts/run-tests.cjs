const { readdirSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { spawnSync } = require("node:child_process");

function collectTests(directory) {
  const tests = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) tests.push(...collectTests(path));
    else if (entry.isFile() && entry.name.endsWith(".test.ts")) tests.push(path);
  }
  return tests;
}

const tests = collectTests(join(process.cwd(), "src"));
if (tests.length === 0) {
  console.error("No TypeScript tests found under src/");
  process.exit(1);
}

tests.sort();
console.log(`Running ${tests.length} TypeScript test files`);
const tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist", "cli.cjs");
const result = spawnSync(process.execPath, [tsxCli, "--test", ...tests], {
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
