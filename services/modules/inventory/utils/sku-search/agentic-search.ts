import type { SkuSearchMetadata, StatusCallback } from "./types";
import {
  fetchPageWithLightpanda,
  fetchPageInteractive,
} from "./browser";
import { evaluateSearchResults, extractProductData } from "./extract";
import { searchViaLightpanda } from "./lightpanda-search";

export async function agenticProductSearch(
  sku: string,
  onStatus?: StatusCallback,
): Promise<SkuSearchMetadata[]> {
  // Step 1: Search via Lightpanda
  onStatus?.(`Searching Google for "${sku}"...`);
  const allResults = await searchViaLightpanda(sku);

  if (allResults.length === 0) {
    onStatus?.(`No search results found for "${sku}".`);
    return [];
  }

  onStatus?.(
    `Found ${allResults.length} result${allResults.length === 1 ? "" : "s"}, ranking by relevance...`,
  );

  // Step 2: Filter and rank results by relevance
  const urlsToFetch = evaluateSearchResults(allResults);
  if (urlsToFetch.length === 0) {
    onStatus?.("No relevant product pages in search results.");
    return [];
  }

  onStatus?.(
    `Selected ${urlsToFetch.length} product page${urlsToFetch.length === 1 ? "" : "s"} to load...`,
  );

  // Step 3: Fetch selected pages (parallel)
  onStatus?.(
    `Loading ${urlsToFetch.length} product page${urlsToFetch.length === 1 ? "" : "s"} in parallel...`,
  );
  const fetchPromises = urlsToFetch.map(async (url) => {
    // Try fast fetch first, fall back to interactive
    let content = await fetchPageWithLightpanda(url);
    if (!content || content.length < 200) {
      const domain = (() => {
        try {
          return new URL(url).hostname.replace(/^www\./, "");
        } catch {
          return url.slice(0, 40);
        }
      })();
      onStatus?.(`Falling back to interactive load for ${domain}...`);
      content = await fetchPageInteractive(url);
    }
    return { url, content };
  });

  const allFetchResults = await Promise.all(fetchPromises);
  const pageContents = allFetchResults.filter((p) => p.content.length > 100);

  if (pageContents.length === 0) {
    onStatus?.("Failed to retrieve content from any product page.");
    return [];
  }

  onStatus?.(
    `Loaded ${pageContents.length} of ${urlsToFetch.length} pages. Asking AI to extract product data...`,
  );

  // Step 4: Agent extracts structured product data
  onStatus?.(
    `AI is analyzing ${pageContents.length} page${pageContents.length === 1 ? "" : "s"} for product details...`,
  );
  const products = await extractProductData(pageContents, sku);

  if (products.length === 0) {
    onStatus?.(`AI could not extract product data for "${sku}".`);
  } else {
    onStatus?.(
      `Found ${products.length} product${products.length === 1 ? "" : "s"} matching "${sku}".`,
    );
  }

  return products;
}
