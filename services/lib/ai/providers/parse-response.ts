/**
 * Safely parse JSON from an HTTP Response body.
 * Some LLM proxies/custom endpoints return valid JSON followed by trailing junk,
 * which makes Response.json() throw:
 * "Unexpected non-whitespace character after JSON".
 */
export async function parseJsonResponse<T = any>(
  response: Response,
  providerLabel: string,
): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error(`${providerLabel}: empty response body (HTTP ${response.status})`);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Try first complete JSON value when trailing content is present
    const recovered = extractFirstJsonValue(trimmed);
    if (recovered !== undefined) {
      return recovered as T;
    }

    const preview = trimmed.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `${providerLabel}: invalid JSON response (HTTP ${response.status}): ${preview}`,
    );
  }
}

function extractFirstJsonValue(text: string): unknown | undefined {
  const start = text.search(/[\[{]/);
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      depth++;
      continue;
    }

    if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return undefined;
        }
      }
    }
  }

  return undefined;
}

export function normalizeChatCompletionsUrl(baseUrl: string): string {
  const cleaned = baseUrl.replace(/\/+$/, "");
  if (cleaned.endsWith("/chat/completions")) {
    return cleaned;
  }
  return `${cleaned}/chat/completions`;
}
