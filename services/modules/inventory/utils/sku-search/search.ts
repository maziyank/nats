import { getSession } from "@/services/lib/auth/auth";
import type { SkuSearchResult, StatusCallback } from "./types";
import { checkRateLimit } from "./rate-limit";
import { logSearch } from "./logging";
import { agenticProductSearch } from "./agentic-search";
import {
  searchUPCitemdb,
  searchOpenFoodFacts,
  searchGoUPC,
} from "./apis";

export async function searchProductBySku(
  sku: string,
  onStatus?: StatusCallback,
): Promise<SkuSearchResult> {
  const startTime = Date.now();

  const trimmedSku = sku.trim();
  if (!trimmedSku) {
    return { success: false, error: "SKU cannot be empty" };
  }

  if (trimmedSku.length > 100) {
    return { success: false, error: "SKU is too long (max 100 characters)" };
  }

  const session = await getSession();
  if (!session) {
    return { success: false, error: "Authentication required" };
  }

  const rateCheck = checkRateLimit(session.userId);
  if (!rateCheck.allowed) {
    logSearch({
      userId: session.userId,
      userName: session.userName,
      sku: trimmedSku,
      success: false,
      resultCount: 0,
      source: "rate-limited",
      timestamp: new Date().toISOString(),
      error: "Rate limit exceeded",
      durationMs: Date.now() - startTime,
    });
    return {
      success: false,
      error: "Too many requests. Please wait a moment before trying again.",
      rateLimit: { remaining: 0 },
    };
  }

  try {
    // ---- Phase 1 (PRIMARY): Agentic AI Search via Lightpanda ----
    onStatus?.("Starting agentic product search...");
    const agenticResults = await agenticProductSearch(trimmedSku, onStatus);
    if (agenticResults.length > 0) {
      const durationMs = Date.now() - startTime;
      logSearch({
        userId: session.userId,
        userName: session.userName,
        sku: trimmedSku,
        success: true,
        resultCount: agenticResults.length,
        source: "agentic-lightpanda",
        timestamp: new Date().toISOString(),
        durationMs,
      });
      return {
        success: true,
        data: agenticResults,
        rateLimit: { remaining: rateCheck.remaining },
      };
    }

    // ---- Phase 2 (FALLBACK): UPCitemdb + Open Food Facts + GoUPC in parallel ----
    onStatus?.("Checking barcode databases...");
    const [upcResults, goUpcResults, offResults] = await Promise.all([
      searchUPCitemdb(trimmedSku),
      searchGoUPC(trimmedSku),
      searchOpenFoodFacts(trimmedSku),
    ]);

    const apiResults = [...upcResults, ...offResults, ...goUpcResults].filter(
      (r) => r.name,
    );
    if (apiResults.length > 0) {
      const durationMs = Date.now() - startTime;
      const source =
        upcResults.length > 0
          ? "upcitemdb"
          : offResults.length > 0
            ? "openfoodfacts"
            : "go-upc";
      onStatus?.(`Found ${apiResults.length} products from ${source}`);
      logSearch({
        userId: session.userId,
        userName: session.userName,
        sku: trimmedSku,
        success: true,
        resultCount: apiResults.length,
        source,
        timestamp: new Date().toISOString(),
        durationMs,
      });
      return {
        success: true,
        data: apiResults.slice(0, 5),
        rateLimit: { remaining: rateCheck.remaining },
      };
    }

    // ---- No results from any source ----
    const durationMs = Date.now() - startTime;
    logSearch({
      userId: session.userId,
      userName: session.userName,
      sku: trimmedSku,
      success: false,
      resultCount: 0,
      source: "none",
      timestamp: new Date().toISOString(),
      error: "No results found",
      durationMs,
    });

    return {
      success: false,
      error: `No product results found for SKU "${trimmedSku}". Try searching with the product name or barcode instead.`,
      rateLimit: { remaining: rateCheck.remaining },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    let errorMessage = "Search failed. Please try again.";

    if (error instanceof Error) {
      if (error.name === "TimeoutError" || error.message.includes("timeout")) {
        errorMessage =
          "Search timed out. Please check your internet connection and try again.";
      } else if (
        error.message.includes("fetch failed") ||
        error.message.includes("network")
      ) {
        errorMessage = "Network error. Please check your internet connection.";
      }
    }

    logSearch({
      userId: session.userId,
      userName: session.userName,
      sku: trimmedSku,
      success: false,
      resultCount: 0,
      source: "error",
      timestamp: new Date().toISOString(),
      error: errorMessage,
      durationMs,
    });

    return { success: false, error: errorMessage };
  }
}
