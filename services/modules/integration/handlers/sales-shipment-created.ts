import type { Prisma } from "@/prisma/generated/prisma/client";
import type { SalesShipmentCreatedPayload } from "@/services/modules/integration/events";

type IntegrationEventHandler<T> = {
    consumer: string;
    handle: (tx: Prisma.TransactionClient, payload: T) => Promise<void>;
};

export const salesShipmentCreatedHandler: IntegrationEventHandler<SalesShipmentCreatedPayload> =
{
    consumer: "sales-reporting",
    handle: async (_tx, payload) => {
        console.log(
            `[SalesShipmentCreated] Shipment ${payload.shipmentNumber} created for order ${payload.salesOrderId} to contact ${payload.contactId}`,
        );
    },
};
