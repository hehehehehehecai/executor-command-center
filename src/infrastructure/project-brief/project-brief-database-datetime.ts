export function canonicalizeProjectBriefDatabaseDatetime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("project_brief_database_datetime_invalid");
  }
  return new Date(parsed).toISOString();
}

export function canonicalizeNullableProjectBriefDatabaseDatetime(
  value: string | null,
): string | null {
  return value === null ? null : canonicalizeProjectBriefDatabaseDatetime(value);
}
