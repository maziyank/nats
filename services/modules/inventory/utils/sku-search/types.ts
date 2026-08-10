export type StatusCallback = (status: string) => void;

export interface SearchLogEntry {
  timestamp: string;
  sku: string;
  userId: string;
  userName?: string;
  source: string;
  success: boolean;
  resultCount: number;
  durationMs: number;
  error?: string;
}

export interface SkuSearchMetadata {
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  images: string[];
  /** Optional — not all sources set a stable source id */
  source?: string;
  /** Optional 0–1 confidence score when available */
  confidence?: number;
  attributes?: Record<string, string>;
  /** Present on some API/agent sources */
  price?: string;
  specifications?: Record<string, string>;
  sourceTitle?: string;
  sourceUrl?: string;
}

export interface SkuSearchResult {
  success: boolean;
  data?: SkuSearchMetadata[];
  error?: string;
  source?: string;
  rateLimit?: { remaining: number };
}
