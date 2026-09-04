export async function finalizeFixtureLifecycle(input) {
  let cleanupFailed = false;

  for (const cleanupTask of input.cleanupTasks) {
    try {
      await cleanupTask();
    } catch {
      cleanupFailed = true;
    }
  }

  return {
    cleanupFailed,
    exitCode:
      input.playwrightExitCode !== 0
        ? input.playwrightExitCode
        : cleanupFailed
          ? 1
          : 0,
  };
}
