if (process.env.NODE_ENV === "production") {
  console.error("project_calibration_fixture_forbidden_in_production");
  process.exit(1);
}

process.env.PROJECT_CALIBRATION_FIXTURE = "1";
await import("./project-calibration-fixture-runner.mjs");
