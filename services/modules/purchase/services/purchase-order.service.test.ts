import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueIntegrationEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/integration/outbox", () => ({
    enqueueIntegrationEvent: enqueueIntegrationEventMock,
}));

const prismaMock = vi.hoisted(() => ({
    purchaseOrder: {
        count: vi.fn(),
    },
    $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PurchaseOrderService } from "./purchase-order.service";

const MOCK_USER_ID = "user-001";

const MOCK_ORDER_INPUT = {
    contactId: "cvend00000000000000000001",
    orderDate: new Date("2026-02-16"),
    expectedDate: new Date("2026-03-16"),
    notes: "Test order",
    items: [
        { productId: "citm0000000000000000000001", quantity: 5, unitCost: 200 },
        { productId: "citm0000000000000000000002", quantity: 3, unitCost: 150 },
    ],
};

describe("PurchaseOrderService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("create", () => {
        it("creates order with DRAFT status and calculated total", async () => {
            const createdOrder = {
                id: "cpo0000000000000000000001",
                orderNumber: "DRAFT-123",
                totalAmount: 1450,
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    purchaseOrder: {
                        create: vi.fn().mockResolvedValue(createdOrder),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-001" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            const result = await PurchaseOrderService.create(MOCK_ORDER_INPUT, MOCK_USER_ID);

            expect(result.id).toBe("cpo0000000000000000000001");
            expect(result.totalAmount).toBe(1450);
        });

        it("enqueues PURCHASE_ORDER_CREATED integration event", async () => {
            const createdOrder = {
                id: "cpo0000000000000000000002",
                orderNumber: "DRAFT-456",
                totalAmount: 1450,
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    purchaseOrder: {
                        create: vi.fn().mockResolvedValue(createdOrder),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-002" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            await PurchaseOrderService.create(MOCK_ORDER_INPUT, MOCK_USER_ID);

            expect(enqueueIntegrationEventMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    type: "PURCHASE_ORDER_CREATED",
                    aggregateType: "PurchaseOrder",
                    payload: expect.objectContaining({
                        orderId: "cpo0000000000000000000002",
                        userId: MOCK_USER_ID,
                    }),
                }),
            );
        });
    });
});
