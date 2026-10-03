/** Small guards for reading untrusted JSON (song files, the library index) without throwing. */

export type JsonObject = Record<string, unknown>

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}
