import type { SkuSearchMetadata } from "./types";
import { callLLM, parseJSON } from "./llm";
import { filterValidImages } from "./images";
import { sanitizeHtml } from "./sanitize";

const AGENT_EXTRACTION_PROMPT = `You are a product data extraction agent. You have been given web page content from search results and product pages related to a product SKU/barcode.

Your task is to:
1. Identify which pages contain actual product information
2. Extract structured product metadata from the best sources
3. Cross-reference data across sources for accuracy

Return ONLY a valid JSON array (no markdown, no backticks). Each object should have this exact structure:
{
  "name": "product name",
  "description": "brief product description",
  "category": "product category",
  "price": "price with currency if found, empty string if not",
  "images": ["array of absolute image URLs (http/https only)"],
  "specifications": {"key": "value pairs of technical specs"},
  "sourceTitle": "the source page title or product name",
  "sourceUrl": "the URL where this product data was found",
  "confidence": "high|medium|low"
}

Rules:
- Prioritize accuracy over completeness - only include data you're confident about
- If multiple products are found, return the most relevant one(s) for the SKU
- Extract all image URLs (absolute URLs only)
- If price is not found, use empty string ""
- Keep specifications concise (max 15 entries)
- Prefer data from authoritative sources (manufacturer sites, major retailers)
- If the content is not about a product, return an empty array []
- Include confidence level based on how well the data matches the queried SKU
- Include sourceUrl from the page where the data was found
- Your response MUST start with [ and end with ] — no explanatory text, no markdown fences`;

export function evaluateSearchResults(
  results: { title: string; url: string }[],
): string[] {
  if (results.length === 0) return [];

  const BLOCKED_DOMAINS = [
    "google.com",
    "bing.com",
    "yahoo.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "tiktok.com",
    "linkedin.com",
    "pinterest.com",
    "youtube.com",
    "vimeo.com",
    "reddit.com",
    "quora.com",
    "stackoverflow.com",
    "scribd.com",
    "slideshare.net",
    "medium.com",
    "wikipedia.org",
  ];

  const PRODUCT_DOMAINS = [
    "amazon.",
    "ebay.",
    "walmart.",
    "target.",
    "bestbuy.",
    "costco.",
    "shopify.",
    "etsy.",
    "alibaba.",
    "aliexpress.",
    "go-upc.com",
    "upcitemdb.com",
    "barcodelookup.com",
    "openfoodfacts.org",
  ];

  const filtered = results.filter((r) => {
    try {
      const hostname = new URL(r.url).hostname.toLowerCase();
      return !BLOCKED_DOMAINS.some((d) => hostname.includes(d));
    } catch {
      return false;
    }
  });

  const scored = filtered.map((r) => {
    let score = 0;
    const urlLower = r.url.toLowerCase();
    const titleLower = r.title.toLowerCase();

    if (PRODUCT_DOMAINS.some((d) => urlLower.includes(d))) score += 10;
    if (/\.(com|net|org|co)\//i.test(urlLower) && !urlLower.includes("blog"))
      score += 2;
    if (/product|item|sku|barcode|upc|ean/i.test(urlLower)) score += 5;
    if (/buy|shop|price|store/i.test(urlLower)) score += 3;
    if (/product|item|sku|barcode|upc|ean/i.test(titleLower)) score += 4;
    if (/buy|shop|price|store/i.test(titleLower)) score += 2;

    return { url: r.url, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.url);
}

export async function extractProductData(
  pageContents: { url: string; content: string }[],
  sku: string,
): Promise<SkuSearchMetadata[]> {
  if (pageContents.length === 0) return [];

  try {
    const contextParts = pageContents.map(
      (p) => `Source URL: ${p.url}\nContent:\n${sanitizeHtml(p.content)}`,
    );

    const response = await callLLM(
      AGENT_EXTRACTION_PROMPT,
      `SKU/Barcode: ${sku}\n\nPage contents from search results:\n\n${contextParts.join("\n\n---\n\n")}`,
    );

    const parsed = parseJSON<any[]>(response);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object" && item.name)
      .slice(0, 5)
      .map((item) => ({
        name: String(item.name || ""),
        description: String(item.description || ""),
        category: String(item.category || ""),
        price: String(item.price || ""),
        images: filterValidImages(
          Array.isArray(item.images) ? item.images.map(String) : [],
        ),
        specifications:
          item.specifications && typeof item.specifications === "object"
            ? Object.fromEntries(
                Object.entries(item.specifications).map(([k, v]) => [
                  String(k),
                  String(v),
                ]),
              )
            : {},
        sourceUrl: String(item.sourceUrl || pageContents[0]?.url || ""),
        sourceTitle: String(item.sourceTitle || item.name || ""),
      }));
  } catch (error) {
    console.error("[SKU Search] Agent extraction failed:", error);
    return [];
  }
}
