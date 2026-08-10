import type { Prisma } from "@/prisma/generated/prisma/client";
import type { SalesPaymentCreatedPayload } from "@/services/modules/integration/events";

type IntegrationEventHandler<T> = {
    consumer: string;
    handle: (tx: Prisma.TransactionClient, payload: T) => Promise<void>;
};

export const salesPaymentCreatedHandler: IntegrationEventHandler<SalesPaymentCreatedPayload> =
{
    consumer: "sales-reporting",
    handle: async (_tx, payload) => {
        console.log(
            `[SalesPaymentCreated] Payment ${payload.paymentNumber} of ${payload.amount} received for invoice ${payload.salesInvoiceId}`,
        );
    },
};
