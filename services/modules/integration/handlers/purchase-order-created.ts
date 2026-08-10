import type { Prisma } from "@/prisma/generated/prisma/client";
import type { PurchaseOrderCreatedPayload } from "@/services/modules/integration/events";

type IntegrationEventHandler<T> = {
    consumer: string;
    handle: (tx: Prisma.TransactionClient, payload: T) => Promise<void>;
};

export const purchaseOrderCreatedHandler: IntegrationEventHandler<PurchaseOrderCreatedPayload> =
{
    consumer: "purchase-reporting",
    handle: async (_tx, payload) => {
        console.log(
            `[PurchaseOrderCreated] Order ${payload.orderNumber} created by ${payload.userId} with total ${payload.totalAmount}`,
        );
        // Future side effects: send notification, sync to external system, etc.
    },
};
