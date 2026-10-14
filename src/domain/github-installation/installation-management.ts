export function personalInstallationManagementUrl(value: unknown, installationId: number): string {
  try {
    if (typeof value !== "string" || !Number.isSafeInteger(installationId) || installationId <= 0) throw new Error();
    const url = new URL(value);
    // Compare the supplied bytes as well: URL parsing normalizes ports, slashes and dot segments.
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port || url.search || url.hash
      || url.pathname !== `/settings/installations/${installationId}`
      || value !== `https://github.com/settings/installations/${installationId}`) throw new Error();
    return value;
  } catch { throw new Error("installation_management_address_unavailable"); }
}
