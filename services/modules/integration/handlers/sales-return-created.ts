import type { Prisma } from "@/prisma/generated/prisma/client";
import type { SalesReturnCreatedPayload } from "@/services/modules/integration/events";

type IntegrationEventHandler<T> = {
    consumer: string;
    handle: (tx: Prisma.TransactionClient, payload: T) => Promise<void>;
};

export const salesReturnCreatedHandler: IntegrationEventHandler<SalesReturnCreatedPayload> =
{
    consumer: "sales-reporting",
    handle: async (_tx, payload) => {
        console.log(
            `[SalesReturnCreated] Return ${payload.returnNumber} created for contact ${payload.contactId} with total ${payload.totalAmount}`,
        );
    },
};
