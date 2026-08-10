import type { Prisma } from "@/prisma/generated/prisma/client";
import type { SalesInvoiceCreatedPayload } from "@/services/modules/integration/events";

type IntegrationEventHandler<T> = {
    consumer: string;
    handle: (tx: Prisma.TransactionClient, payload: T) => Promise<void>;
};

export const salesInvoiceCreatedHandler: IntegrationEventHandler<SalesInvoiceCreatedPayload> =
{
    consumer: "sales-reporting",
    handle: async (_tx, payload) => {
        console.log(
            `[SalesInvoiceCreated] Invoice ${payload.invoiceNumber} created for contact ${payload.contactId} with total ${payload.totalAmount}`,
        );
        // Future side effects: send notification, sync to external system, etc.
    },
};
