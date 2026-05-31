/** Single source of "current time" as an ISO-8601 string. */
export function now(): string {
  return new Date().toISOString();
}
