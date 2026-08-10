import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueIntegrationEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/integration/outbox", () => ({
    enqueueIntegrationEvent: enqueueIntegrationEventMock,
}));

const generateDocumentNumberMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/document-numbering", () => ({
    getOrCreateDocumentNumbering: vi.fn(),
    generateDocumentNumber: generateDocumentNumberMock,
}));

const prismaMock = vi.hoisted(() => ({
    salesShipment: { count: vi.fn() },
    $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { SalesShipmentService } from "./sales-shipment.service";

const MOCK_USER_ID = "user-001";

const MOCK_SHIPMENT_INPUT = {
    contactId: "ccust00000000000000000001",
    salesOrderId: "csord000000000000000000001",
    shipmentDate: new Date("2026-02-16"),
    items: [
        { productId: "cprod000000000000000000001", quantity: 5 },
    ],
};

describe("SalesShipmentService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("create", () => {
        it("creates shipment and enqueues outbox event", async () => {
            prismaMock.salesShipment.count.mockResolvedValue(0);
            generateDocumentNumberMock.mockResolvedValue("SHP-2602-0001");

            const createdShipment = {
                id: "cshp0000000000000000000001",
                shipmentNumber: "SHP-2602-0001",
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    salesShipment: { create: vi.fn().mockResolvedValue(createdShipment) },
                    integrationOutbox: { create: vi.fn().mockResolvedValue({ id: "outbox-001" }) },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            const result = await SalesShipmentService.create(MOCK_SHIPMENT_INPUT, MOCK_USER_ID);

            expect(result.id).toBe("cshp0000000000000000000001");
            expect(enqueueIntegrationEventMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    type: "SALES_SHIPMENT_CREATED",
                    aggregateType: "SalesShipment",
                    payload: expect.objectContaining({
                        shipmentId: "cshp0000000000000000000001",
                        salesOrderId: "csord000000000000000000001",
                        userId: MOCK_USER_ID,
                    }),
                }),
            );
        });

        it("auto-generates shipment number", async () => {
            prismaMock.salesShipment.count.mockResolvedValue(5);
            generateDocumentNumberMock.mockResolvedValue("SHP-2602-0006");

            const createdShipment = {
                id: "cshp0000000000000000000002",
                shipmentNumber: "SHP-2602-0006",
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    salesShipment: { create: vi.fn().mockResolvedValue(createdShipment) },
                    integrationOutbox: { create: vi.fn().mockResolvedValue({ id: "outbox-002" }) },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            const result = await SalesShipmentService.create(MOCK_SHIPMENT_INPUT, MOCK_USER_ID);

            expect(result.shipmentNumber).toBe("SHP-2602-0006");
            expect(generateDocumentNumberMock).toHaveBeenCalledOnce();
        });
    });
});
