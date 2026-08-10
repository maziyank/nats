import { inventoryMovementCreatedPayloadSchema, productCreatedPayloadSchema } from "@/services/modules/integration/events";
import type { Prisma } from "@/prisma/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export async function handleInventoryMovementCreated(tx: Tx, payloadInput: unknown) {
    const payload = inventoryMovementCreatedPayloadSchema.parse(payloadInput);
    // currently no-op / logging
    console.log(`[Integration] Inventory Movement Created: ${payload.movementId}, Type: ${payload.type}`);
}

export async function handleProductCreated(tx: Tx, payloadInput: unknown) {
    const payload = productCreatedPayloadSchema.parse(payloadInput);
    // currently no-op / logging
    console.log(`[Integration] Product Created: ${payload.productId}, Name: ${payload.name}`);
}
