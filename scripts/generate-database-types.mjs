import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(
  projectRoot,
  "src",
  "infrastructure",
  "database",
  "database.types.ts",
);
const cliPath = path.join(
  projectRoot,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const cliArguments = [
  "gen",
  "types",
  "typescript",
  "--local",
  "--schema",
  "public,app_private",
];
const checkOnly = process.argv.slice(2).includes("--check");

const normalize = (value) => `${value.replace(/\r\n/g, "\n").trimEnd()}\n`;

const invokeSupabase = () => {
  if (!existsSync(cliPath)) {
    throw new Error(`Project Supabase CLI is missing at ${cliPath}`);
  }

  return spawnSync(process.execPath, [cliPath, ...cliArguments], {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
  });
};

const result = invokeSupabase();

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "Supabase type generation failed.\n");
  process.exit(result.status ?? 1);
}

const generatedTypes = normalize(result.stdout);

if (checkOnly) {
  if (!existsSync(outputPath)) {
    process.stderr.write(`Generated database types are missing at ${outputPath}.\n`);
    process.exit(1);
  }

  const committedTypes = normalize(readFileSync(outputPath, "utf8"));

  if (committedTypes !== generatedTypes) {
    process.stderr.write(
      "Generated database types differ from src/infrastructure/database/database.types.ts.\n",
    );
    process.exit(1);
  }

  process.stdout.write("Generated database types are up to date.\n");
  process.exit(0);
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, generatedTypes, { encoding: "utf8" });
process.stdout.write(`Generated database types at ${outputPath}.\n`);
