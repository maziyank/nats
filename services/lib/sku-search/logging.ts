import type { SearchLogEntry } from "./types";

export const searchLogs: SearchLogEntry[] = [];

export function logSearch(entry: SearchLogEntry): void {
  searchLogs.push(entry);
  if (searchLogs.length > 1000) {
    searchLogs.shift();
  }
  console.log(
    `[SKU Search] ${entry.sku} via ${entry.source}: ${entry.success ? "OK" : "FAIL"} (${entry.durationMs}ms)`,
  );
}
