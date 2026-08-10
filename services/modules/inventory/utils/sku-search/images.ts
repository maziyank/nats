/**
 * Validate that a URL looks like a usable product image.
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (url.startsWith("data:")) return false;
    const lower = url.toLowerCase();
    if (
      lower.includes("1x1") ||
      lower.includes("pixel") ||
      lower.includes("spacer") ||
      lower.includes("blank.") ||
      lower.includes("transparent")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function filterValidImages(images: string[]): string[] {
  return images.filter(isValidImageUrl);
}
