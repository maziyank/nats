import type { Prisma } from "@/prisma/generated/prisma/client";
import type { SalesOrderCreatedPayload } from "@/services/modules/integration/events";

// In a real app, this would be imported from a barrel file or similar
type IntegrationEventHandler<T> = {
    consumer: string;
    handle: (tx: Prisma.TransactionClient, payload: T) => Promise<void>;
};

export const salesOrderCreatedHandler: IntegrationEventHandler<SalesOrderCreatedPayload> =
{
    consumer: "sales-reporting",
    handle: async (_tx, payload) => {
        console.log(
            `[SalesOrderCreated] Order ${payload.orderNumber} created by ${payload.userId} with total ${payload.totalAmount}`
        );
        // Here you would trigger side effects: send email, update report, etc.
    },
};
