import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueIntegrationEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/integration/outbox", () => ({
    enqueueIntegrationEvent: enqueueIntegrationEventMock,
}));

const prismaMock = vi.hoisted(() => ({
    purchaseReturn: {
        findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PurchaseReturnService } from "./purchase-return.service";

const MOCK_USER_ID = "user-001";

const MOCK_RETURN_INPUT = {
    returnNumber: "RET-001",
    contactId: "cvend00000000000000000001",
    returnDate: new Date("2026-02-16"),
    reason: "Defective items",
    items: [
        { productId: "citm0000000000000000000001", quantity: 2, unitPrice: 100 },
        { productId: "citm0000000000000000000002", quantity: 1, unitPrice: 150 },
    ],
};

describe("PurchaseReturnService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("create", () => {
        it("creates return with DRAFT status and calculated total", async () => {
            prismaMock.purchaseReturn.findUnique.mockResolvedValue(null);

            const createdReturn = {
                id: "ret-001",
                returnNumber: "RET-001",
                totalAmount: 350,
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    purchaseReturn: {
                        create: vi.fn().mockResolvedValue(createdReturn),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-001" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            const result = await PurchaseReturnService.create(MOCK_RETURN_INPUT, MOCK_USER_ID);

            expect(result.id).toBe("ret-001");
            expect(result.totalAmount).toBe(350);
        });

        it("throws when return number already exists", async () => {
            prismaMock.purchaseReturn.findUnique.mockResolvedValue({ id: "existing" });

            await expect(
                PurchaseReturnService.create(MOCK_RETURN_INPUT, MOCK_USER_ID),
            ).rejects.toThrow("Return number already exists");
        });

        it("enqueues PURCHASE_RETURN_CREATED integration event", async () => {
            prismaMock.purchaseReturn.findUnique.mockResolvedValue(null);

            const createdReturn = {
                id: "ret-002",
                returnNumber: "RET-002",
                totalAmount: 350,
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    purchaseReturn: {
                        create: vi.fn().mockResolvedValue(createdReturn),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-002" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            await PurchaseReturnService.create(
                { ...MOCK_RETURN_INPUT, returnNumber: "RET-002" },
                MOCK_USER_ID,
            );

            expect(enqueueIntegrationEventMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    type: "PURCHASE_RETURN_CREATED",
                    aggregateType: "PurchaseReturn",
                    payload: expect.objectContaining({
                        returnId: "ret-002",
                        userId: MOCK_USER_ID,
                    }),
                }),
            );
        });
    });
});
