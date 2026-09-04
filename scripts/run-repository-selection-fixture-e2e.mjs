if (process.env.NODE_ENV === "production") {
  console.error("repository_selection_fixture_forbidden_in_production");
  process.exit(1);
}

await import("./repository-selection-fixture-runner.mjs");
