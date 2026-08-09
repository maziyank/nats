import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueIntegrationEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/integration/outbox", () => ({
    enqueueIntegrationEvent: enqueueIntegrationEventMock,
}));

const prismaMock = vi.hoisted(() => ({
    purchaseInvoice: {
        findUnique: vi.fn(),
    },
    purchasePayment: {
        count: vi.fn(),
    },
    cashAccount: {
        findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/document-numbering", () => ({
    generateDocumentNumber: vi.fn().mockResolvedValue("PAY-OUT-2602-0001"),
}));

import { PurchasePaymentService } from "./purchase-payment.service";

const MOCK_USER_ID = "user-001";

const MOCK_PAYMENT_INPUT = {
    contactId: "cvend00000000000000000001",
    purchaseInvoiceId: "cinvc00000000000000000001",
    paymentDate: new Date("2026-02-16"),
    amount: 500,
    cashAccountId: "ccash0000000000000000000001",
    reference: "REF-001",
};

describe("PurchasePaymentService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("create", () => {
        it("creates payment and updates invoice status", async () => {
            prismaMock.purchaseInvoice.findUnique.mockResolvedValue({
                id: "cinvc00000000000000000001",
                totalAmount: 1000,
                payments: [{ amount: 300 }],
            });
            prismaMock.cashAccount.findUnique.mockResolvedValue({ id: "ccash0000000000000000000001" });
            prismaMock.purchasePayment.count.mockResolvedValue(0);

            const createdPayment = {
                id: "cpaym000000000000000000001",
                paymentNumber: "PAY-OUT-2602-0001",
                amount: 500,
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    purchasePayment: {
                        create: vi.fn().mockResolvedValue(createdPayment),
                    },
                    purchaseInvoice: {
                        update: vi.fn(),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-001" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            const result = await PurchasePaymentService.create(MOCK_PAYMENT_INPUT, MOCK_USER_ID);

            expect(result.id).toBe("cpaym000000000000000000001");
        });

        it("throws when invoice not found", async () => {
            prismaMock.purchaseInvoice.findUnique.mockResolvedValue(null);

            await expect(
                PurchasePaymentService.create(MOCK_PAYMENT_INPUT, MOCK_USER_ID),
            ).rejects.toThrow("Invoice not found");
        });

        it("throws when amount exceeds remaining balance", async () => {
            prismaMock.purchaseInvoice.findUnique.mockResolvedValue({
                id: "cinvc00000000000000000001",
                totalAmount: 500,
                payments: [{ amount: 400 }],
            });
            prismaMock.cashAccount.findUnique.mockResolvedValue({ id: "ccash0000000000000000000001" });

            await expect(
                PurchasePaymentService.create(
                    { ...MOCK_PAYMENT_INPUT, amount: 200 },
                    MOCK_USER_ID,
                ),
            ).rejects.toThrow("Amount exceeds remaining balance");
        });

        it("enqueues PURCHASE_PAYMENT_CREATED integration event", async () => {
            prismaMock.purchaseInvoice.findUnique.mockResolvedValue({
                id: "cinvc00000000000000000001",
                totalAmount: 1000,
                payments: [],
            });
            prismaMock.cashAccount.findUnique.mockResolvedValue({ id: "ccash0000000000000000000001" });
            prismaMock.purchasePayment.count.mockResolvedValue(0);

            const createdPayment = {
                id: "cpaym000000000000000000002",
                paymentNumber: "PAY-OUT-2602-0001",
                amount: 500,
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    purchasePayment: {
                        create: vi.fn().mockResolvedValue(createdPayment),
                    },
                    purchaseInvoice: {
                        update: vi.fn(),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-002" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            await PurchasePaymentService.create(MOCK_PAYMENT_INPUT, MOCK_USER_ID);

            expect(enqueueIntegrationEventMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    type: "PURCHASE_PAYMENT_CREATED",
                    aggregateType: "PurchasePayment",
                    payload: expect.objectContaining({
                        paymentId: "cpaym000000000000000000002",
                        userId: MOCK_USER_ID,
                    }),
                }),
            );
        });
    });
});
