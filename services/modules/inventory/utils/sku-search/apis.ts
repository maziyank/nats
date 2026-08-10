import type { SkuSearchMetadata } from "./types";
import { filterValidImages } from "./images";
import { fetchPageWithLightpanda } from "./browser";
import { callLLM, parseJSON } from "./llm";

export async function searchUPCitemdb(sku: string): Promise<SkuSearchMetadata[]> {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(sku)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) return [];

    const data = await response.json();
    if (data.code !== "OK" || !data.items || data.items.length === 0) {
      return [];
    }

    return data.items.slice(0, 5).map((item: any) => ({
      name: item.title || item.description || "",
      description: item.description || item.title || "",
      category: item.category || "",
      price: item.highest_recorded_price
        ? `$${item.highest_recorded_price}`
        : item.lowest_recorded_price
          ? `$${item.lowest_recorded_price}`
          : "",
      images: filterValidImages(item.images || []),
      specifications: Object.fromEntries(
        Object.entries(item.attributes || {}).map(([k, v]) => [k, String(v)]),
      ),
      sourceUrl: item.offers?.[0]?.link || "",
      sourceTitle: item.title || "",
    }));
  } catch {
    return [];
  }
}

export async function searchOpenFoodFacts(sku: string): Promise<SkuSearchMetadata[]> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(sku)}.json`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) return [];

    const data = await response.json();
    if (data.status !== 1 || !data.product) return [];

    const p = data.product;
    const images = [
      p.image_front_url,
      p.image_front_small_url,
      p.image_url,
      ...(p.images || []).map((img: any) => img.url || img.full_size_url),
    ].filter(Boolean);

    const specs: Record<string, string> = {};
    if (p.nutriments) {
      const important = [
        "energy-kcal_100g",
        "fat_100g",
        "proteins_100g",
        "carbohydrates_100g",
        "salt_100g",
      ];
      for (const key of important) {
        if (p.nutriments[key] !== undefined) {
          specs[key.replace("_100g", " per 100g")] = String(p.nutriments[key]);
        }
      }
    }

    return [
      {
        name: p.product_name || p.product_name_en || "",
        description: p.generic_name || p.generic_name_en || "",
        category: p.categories || "",
        price: "",
        images: filterValidImages(images),
        specifications: specs,
        sourceUrl: `https://world.openfoodfacts.org/product/${sku}`,
        sourceTitle: p.product_name || "",
      },
    ];
  } catch {
    return [];
  }
}

export async function searchGoUPC(sku: string): Promise<SkuSearchMetadata[]> {
  try {
    const url = `https://go-upc.com/search?q=${encodeURIComponent(sku)}`;
    const content = await fetchPageWithLightpanda(url);
    if (!content || content.length < 100) return [];

    // Use LLM to extract product data from the page content
    const response = await callLLM(
      `You are a product data extractor. Given HTML/text content from a barcode lookup page (go-upc.com), extract product information.

Return ONLY a valid JSON array (no markdown). Each object:
{
  "name": "product name",
  "description": "brief description",
  "category": "category",
  "price": "price with currency or empty string",
  "images": ["image URLs"],
  "specifications": {"key": "value"},
  "sourceTitle": "product name"
}

Rules:
- Extract only actual product data, skip navigation/boilerplate text
- If no product found, return empty array []`,
      `Barcode/SKU: ${sku}\nPage content from go-upc.com:\n${content.substring(0, 4000)}`,
    );

    const parsed = parseJSON<any[]>(response);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object" && item.name)
      .slice(0, 3)
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
        sourceUrl: url,
        sourceTitle: String(item.sourceTitle || item.name || ""),
      }));
  } catch {
    return [];
  }
}
