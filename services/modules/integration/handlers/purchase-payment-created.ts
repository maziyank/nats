import type { Prisma } from "@/prisma/generated/prisma/client";
import type { PurchasePaymentCreatedPayload } from "@/services/modules/integration/events";

type IntegrationEventHandler<T> = {
    consumer: string;
    handle: (tx: Prisma.TransactionClient, payload: T) => Promise<void>;
};

export const purchasePaymentCreatedHandler: IntegrationEventHandler<PurchasePaymentCreatedPayload> =
{
    consumer: "purchase-reporting",
    handle: async (_tx, payload) => {
        console.log(
            `[PurchasePaymentCreated] Payment ${payload.paymentNumber} created for invoice ${payload.purchaseInvoiceId} with amount ${payload.amount}`,
        );
        // Future side effects: send notification, sync to external system, etc.
    },
};
