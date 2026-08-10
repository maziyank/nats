/* eslint-disable @typescript-eslint/no-explicit-any */
import { sanitizeHtml } from "./sanitize";


let lightpandaProc: any = null;
let lightpandaReady = false;

export async function ensureLightpanda(): Promise<boolean> {
  if (lightpandaReady) return true;
  try {
    const { lightpanda } = await import("@lightpanda/browser");
    lightpandaProc = await lightpanda.serve({
      host: "127.0.0.1",
      port: 9222,
    });

    // Run headless in background: suppress all process output and detach
    if (lightpandaProc.stdout) lightpandaProc.stdout.destroy();
    if (lightpandaProc.stderr) lightpandaProc.stderr.destroy();
    lightpandaProc.unref();

    lightpandaReady = true;
    return true;
  } catch (error) {
    console.error("[SKU Search] Failed to start Lightpanda:", error);
    return false;
  }
}

export function cleanupLightpanda(): void {
  if (lightpandaProc) {
    try {
      lightpandaProc.stdout?.destroy();
      lightpandaProc.stderr?.destroy();
      lightpandaProc.kill();
    } catch {}
    lightpandaProc = null;
    lightpandaReady = false;
  }
  // Invalidate cached browser/context so the next call reconnects
  try {
    if (cachedBrowser) cachedBrowser.disconnect();
  } catch {}
  cachedBrowser = null;
  cachedContext = null;
  connectPromise = null;
}

// Auto-cleanup on process exit
if (typeof process !== "undefined") {
  process.on("exit", cleanupLightpanda);
  process.on("SIGINT", cleanupLightpanda);
  process.on("SIGTERM", cleanupLightpanda);
}

// ============================================================================
// Lightpanda Page Fetching
// ============================================================================

// Cached puppeteer module + persistent browser/context across calls
let puppeteerModule: typeof import("puppeteer-core") | null = null;
let cachedBrowser: any = null;
let cachedContext: any = null;
let connectPromise: Promise<any> | null = null;

async function getPuppeteer(): Promise<typeof import("puppeteer-core")> {
  if (!puppeteerModule) {
    puppeteerModule = await import("puppeteer-core");
  }
  return puppeteerModule;
}

async function getConnectedBrowser(): Promise<any> {
  if (cachedBrowser && cachedBrowser.connected) return cachedBrowser;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const ready = await ensureLightpanda();
    if (!ready) throw new Error("Lightpanda not ready");

    const versionRes = await fetch("http://127.0.0.1:9222/json/version");
    const versionData = await versionRes.json();

    const puppeteer = await getPuppeteer();
    const browser = await puppeteer.default.connect({
      browserWSEndpoint: versionData.webSocketDebuggerUrl,
      defaultViewport: { width: 1280, height: 720 },
    });

    browser.on("disconnected", () => {
      cachedBrowser = null;
      cachedContext = null;
    });

    cachedBrowser = browser;
    connectPromise = null;
    return browser;
  })().catch((err) => {
    connectPromise = null;
    throw err;
  });

  return connectPromise;
}

export async function getBrowserContext(): Promise<any> {
  const browser = await getConnectedBrowser();
  if (cachedContext) {
    try {
      // Verify context is still usable; some browsers return null on closed contexts
      const pages = await cachedContext.pages();
      if (pages) return cachedContext;
    } catch {
      cachedContext = null;
    }
  }
  cachedContext = await browser.createBrowserContext();
  return cachedContext;
}

// Resource types to block — saves significant time on Google search pages
const BLOCKED_RESOURCE_TYPES = new Set([
  "image",
  "font",
  "media",
  "stylesheet", // we only need structure, not styling
]);

export async function attachRequestBlocker(page: any): Promise<void> {
  await page.setRequestInterception(true);
  page.on("request", (req: any) => {
    try {
      const rt = req.resourceType();
      if (BLOCKED_RESOURCE_TYPES.has(rt)) {
        req.abort().catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    } catch {
      req.continue?.().catch(() => {});
    }
  });
}

export async function fetchPageWithLightpanda(url: string): Promise<string> {
  try {
    const ready = await ensureLightpanda();
    if (!ready) return "";

    const { lightpanda } = await import("@lightpanda/browser");
    const result = await lightpanda.fetch(url, {
      dump: true,
    });

    const raw =
      typeof result === "string"
        ? result
        : result && typeof result === "object" && "content" in result
          ? String((result as any).content)
          : "";
    return sanitizeHtml(raw).substring(0, 4000);
  } catch (error) {
    console.error(`[SKU Search] Lightpanda fetch failed for ${url}:`, error);
    return "";
  }
}

export async function fetchPageInteractive(url: string): Promise<string> {
  let page: any = null;
  try {
    const context = await getBrowserContext();
    page = await context.newPage({ background: true });
    await attachRequestBlocker(page);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });

    // Reduced wait — interactive fetches need a moment for JS hydration
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const content = await page.evaluate(() => {
      return (
        document.body?.innerHTML || document.documentElement?.innerHTML || ""
      );
    });

    await page.close();
    page = null;
    return sanitizeHtml(content).substring(0, 4000);
  } catch (error) {
    console.error(`[SKU Search] Interactive fetch failed for ${url}:`, error);
    return "";
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }
  }
}
