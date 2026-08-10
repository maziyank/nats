import type { Prisma } from "@/prisma/generated/prisma/client";
import type { PurchaseReceiveCreatedPayload } from "@/services/modules/integration/events";

type IntegrationEventHandler<T> = {
    consumer: string;
    handle: (tx: Prisma.TransactionClient, payload: T) => Promise<void>;
};

export const purchaseReceiveCreatedHandler: IntegrationEventHandler<PurchaseReceiveCreatedPayload> =
{
    consumer: "purchase-reporting",
    handle: async (_tx, payload) => {
        console.log(
            `[PurchaseReceiveCreated] Receive ${payload.receiveNumber} created for contact ${payload.contactId}`,
        );
        // Future side effects: send notification, sync to external system, etc.
    },
};
