if (process.env.NODE_ENV === "production") {
  console.error("connected_onboarding_fixture_forbidden_in_production");
  process.exit(1);
}

process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.CONNECTED_ONBOARDING_FIXTURE = "1";
await import("./connected-onboarding-fixture-runner.mjs");
