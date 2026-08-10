import {
  ensureLightpanda,
  getBrowserContext,
  attachRequestBlocker,
} from "./browser";

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function searchViaLightpanda(
  query: string,
  retries = 1,
): Promise<SearchResult[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page: any = null;
    try {
      const ready = await ensureLightpanda();
      if (!ready) return [];

      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        console.log(
          `[SKU Search] Retrying Lightpanda search (attempt ${attempt + 1}/${retries + 1})`,
        );
      }

      const context = await getBrowserContext();
      page = await context.newPage({ background: true });
      await attachRequestBlocker(page);

      // Navigate to Google search
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=en`;
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 5000,
      });

      // Extract search results using DOM selectors
      const results: SearchResult[] = await page.evaluate(() => {
        const items: { title: string; snippet: string; url: string }[] = [];
        // Modern Google SERP uses a[href][data-ved] or a:has(h3). Use scoped queries.
        const links = Array.from(
          document.querySelectorAll<HTMLAnchorElement>(
            "a[href^='http']:has(h3), a[href][data-ved]:has(h3)",
          ),
        );

        for (const linkEl of links) {
          const titleEl = linkEl.querySelector("h3");
          if (!titleEl) continue;

          const href = linkEl.href;
          if (
            !href ||
            href.includes("google.com") ||
            !href.startsWith("http")
          ) {
            continue;
          }

          // Snippet: walk up to the result container, then find snippet text
          const container =
            linkEl.closest("div[data-hveid]") ||
            linkEl.closest("div.g") ||
            linkEl.parentElement?.parentElement;
          const snippetEl = container?.querySelector(
            ".VwiC3b, .IsZvec, [data-sncf], span.st, div[style*='webkit-line-clamp']",
          );

          items.push({
            title: titleEl.textContent?.trim() || "",
            snippet: snippetEl?.textContent?.trim() || "",
            url: href,
          });
          if (items.length >= 8) break;
        }
        return items;
      });

      await page.close();
      page = null;
      return results;
    } catch (error) {
      const isLast = attempt === retries;
      if (isLast) {
        console.error("[SKU Search] Lightpanda search failed:", error);
      }
      if (isLast) return [];
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {}
      }
    }
  }
  return [];
}
