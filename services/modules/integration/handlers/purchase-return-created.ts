import type { Prisma } from "@/prisma/generated/prisma/client";
import type { PurchaseReturnCreatedPayload } from "@/services/modules/integration/events";

type IntegrationEventHandler<T> = {
    consumer: string;
    handle: (tx: Prisma.TransactionClient, payload: T) => Promise<void>;
};

export const purchaseReturnCreatedHandler: IntegrationEventHandler<PurchaseReturnCreatedPayload> =
{
    consumer: "purchase-reporting",
    handle: async (_tx, payload) => {
        console.log(
            `[PurchaseReturnCreated] Return ${payload.returnNumber} created for contact ${payload.contactId} with total ${payload.totalAmount}`,
        );
        // Future side effects: send notification, sync to external system, etc.
    },
};
