export function clonePreviewFixture<T>(fixture: T): T {
  return structuredClone(fixture);
}
