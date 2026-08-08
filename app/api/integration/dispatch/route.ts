import { z } from "zod";
import { dispatchPendingIntegrationEvents } from "@/modules/integration/outbox";

const dispatchParamsSchema = z.object({
  limit: z.coerce.number().finite().optional().catch(undefined),
});

export async function POST(request: Request) {
  const expectedKey = process.env.INTEGRATION_DISPATCH_KEY;
  const providedKey = request.headers.get("x-integration-dispatch-key");

  if (!expectedKey || providedKey !== expectedKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const { limit } = dispatchParamsSchema.parse(Object.fromEntries(url.searchParams));

  const result = await dispatchPendingIntegrationEvents({ limit });

  return Response.json(result);
}

