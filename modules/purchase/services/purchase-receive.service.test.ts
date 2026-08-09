import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueIntegrationEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/integration/outbox", () => ({
    enqueueIntegrationEvent: enqueueIntegrationEventMock,
}));

const prismaMock = vi.hoisted(() => ({
    purchaseReceive: {
        count: vi.fn(),
    },
    $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/document-numbering", () => ({
    generateDocumentNumber: vi.fn().mockResolvedValue("RCV-2602-0006"),
}));

import { PurchaseReceiveService } from "./purchase-receive.service";

const MOCK_USER_ID = "user-001";

const MOCK_RECEIVE_INPUT = {
    contactId: "cvend00000000000000000001",
    purchaseOrderId: "cpo0000000000000000000001",
    receiveDate: new Date("2026-02-16"),
    notes: "Test receive",
    items: [
        { productId: "citm0000000000000000000001", quantity: 5 },
        { productId: "citm0000000000000000000002", quantity: 3 },
    ],
};

describe("PurchaseReceiveService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("create", () => {
        it("creates receive with DRAFT status and generated number", async () => {
            const createdReceive = {
                id: "crcev00000000000000000001",
                receiveNumber: "RCV-2602-0006",
                status: "DRAFT",
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    purchaseReceive: {
                        create: vi.fn().mockResolvedValue(createdReceive),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-001" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            const result = await PurchaseReceiveService.create(MOCK_RECEIVE_INPUT, MOCK_USER_ID);

            expect(result.id).toBe("crcev00000000000000000001");
            expect(result.receiveNumber).toBe("RCV-2602-0006");
        });

        it("enqueues PURCHASE_RECEIVE_CREATED integration event", async () => {
            const createdReceive = {
                id: "crcev00000000000000000002",
                receiveNumber: "RCV-2602-0001",
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    purchaseReceive: {
                        create: vi.fn().mockResolvedValue(createdReceive),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-002" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            await PurchaseReceiveService.create(MOCK_RECEIVE_INPUT, MOCK_USER_ID);

            expect(enqueueIntegrationEventMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    type: "PURCHASE_RECEIVE_CREATED",
                    aggregateType: "PurchaseReceive",
                    payload: expect.objectContaining({
                        receiveId: "crcev00000000000000000002",
                        userId: MOCK_USER_ID,
                    }),
                }),
            );
        });
    });
});
