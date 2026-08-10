export type ExportFormat = "csv" | "xlsx";

export type ExportColumn<T = Record<string, unknown>> = {
  /** Property key on the row object, or a custom accessor key used with `accessor`. */
  key: string;
  /** Column header shown in the exported file. */
  header: string;
  /** Optional value resolver when the value is nested or derived. */
  accessor?: (row: T) => unknown;
  /** Optional formatter applied after the raw value is resolved. */
  format?: (value: unknown, row: T) => string | number | boolean | null | undefined;
};

export type ExportOptions<T = Record<string, unknown>> = {
  rows: T[];
  columns: ExportColumn<T>[];
  filename: string;
  format: ExportFormat;
  sheetName?: string;
};

export type ExportResult =
  | {
      success: true;
      filename: string;
      mimeType: string;
      /** Base64-encoded file contents for server → client transfer. */
      base64: string;
      /**
       * Raw file bytes. Prefer this for binary API responses to avoid
       * base64 encode/decode. Present when generation ran on the server.
       */
      buffer?: Buffer;
      rowCount: number;
    }
  | {
      success: false;
      error: string;
      code?: "EMPTY" | "TOO_LARGE" | "RATE_LIMITED" | "UNAUTHORIZED" | "FAILED";
    };

export const EXPORT_LIMITS = {
  /** Soft warning threshold — UI may show a confirm dialog. */
  WARN_ROW_COUNT: 5_000,
  /** Hard maximum rows per export. */
  MAX_ROW_COUNT: 50_000,
  /** Max concurrent export generations per user window. */
  RATE_LIMIT_MAX: 10,
  /** Rate limit window in milliseconds (1 minute). */
  RATE_LIMIT_WINDOW_MS: 60_000,
} as const;
