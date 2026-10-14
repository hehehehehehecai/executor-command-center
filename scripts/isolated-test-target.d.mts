export function verifiedContainerName(): string;
export function assertIsolatedApiUrl(url: string | undefined): string;
export function readIsolatedStatus(): { status: number; stdout: string; stderr: string };
export function verifyIsolatedDatabase(): { containerId: string; containerName: string; apiUrl: string; projectId: string; systemIdentifier: string };
