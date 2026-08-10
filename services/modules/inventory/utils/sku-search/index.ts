/**
 * SKU / barcode product search — public API.
 * Implementation is split across sibling modules for maintainability.
 */
export type {
  StatusCallback,
  SearchLogEntry,
  SkuSearchMetadata,
  SkuSearchResult,
} from "./types";
export { searchLogs } from "./logging";
export { checkRateLimit } from "./rate-limit";
export { isValidImageUrl, filterValidImages } from "./images";
export { searchProductBySku } from "./search";
