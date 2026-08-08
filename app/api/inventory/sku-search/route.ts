import { NextRequest } from "next/server";
import { z } from "zod";
import { searchProductBySku } from "@/lib/sku-search";

const skuSearchParamsSchema = z.object({
  sku: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const parsed = skuSearchParamsSchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "SKU parameter is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sku = parsed.data.sku;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const result = await searchProductBySku(sku, (status) => {
          send({ type: "status", message: status });
        });

        send({ type: "result", data: result });
      } catch (error) {
        send({
          type: "result",
          data: {
            success: false,
            error: "Search failed. Please try again.",
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
