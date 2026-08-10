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
    salesInvoice: {
        count: vi.fn(),
        findUnique: vi.fn(),
    },
    taxRate: {
        findMany: vi.fn(),
    },
    $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { SalesInvoiceService } from "./sales-invoice.service";

const MOCK_USER_ID = "user-001";

const MOCK_INVOICE_INPUT = {
    contactId: "ccust00000000000000000001",
    invoiceDate: new Date("2026-02-16"),
    dueDate: new Date("2026-03-16"),
    globalDiscount: 0,
    totalTax: 0,
    shippingCost: 0,
    items: [
        {
            description: "Widget A",
            quantity: 2,
            unitPrice: 100,
            discount: 0,
            tax: 0,
        },
    ],
};

describe("SalesInvoiceService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("create", () => {
        it("generates invoice number when not provided", async () => {
            prismaMock.salesInvoice.count.mockResolvedValue(5);
            prismaMock.salesInvoice.findUnique.mockResolvedValue(null);
            prismaMock.taxRate.findMany.mockResolvedValue([]);
            generateDocumentNumberMock.mockResolvedValue("INV-2602-0006");

            const createdInvoice = {
                id: "cinv000000000000000000001",
                invoiceNumber: "INV-2602-0006",
                totalAmount: 200,
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    salesInvoice: {
                        create: vi.fn().mockResolvedValue(createdInvoice),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-001" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            const result = await SalesInvoiceService.create(MOCK_INVOICE_INPUT, MOCK_USER_ID);

            expect(result.id).toBe("cinv000000000000000000001");
            expect(generateDocumentNumberMock).toHaveBeenCalledOnce();
        });

        it("uses provided invoice number when given", async () => {
            prismaMock.salesInvoice.findUnique.mockResolvedValue(null);
            prismaMock.taxRate.findMany.mockResolvedValue([]);

            const createdInvoice = {
                id: "cinv000000000000000000002",
                invoiceNumber: "CUSTOM-001",
                totalAmount: 200,
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    salesInvoice: {
                        create: vi.fn().mockResolvedValue(createdInvoice),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-002" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            const result = await SalesInvoiceService.create(
                { ...MOCK_INVOICE_INPUT, invoiceNumber: "CUSTOM-001" },
                MOCK_USER_ID,
            );

            expect(result.invoiceNumber).toBe("CUSTOM-001");
            expect(generateDocumentNumberMock).not.toHaveBeenCalled();
        });

        it("throws when invoice number already exists", async () => {
            prismaMock.salesInvoice.findUnique.mockResolvedValue({ id: "existing" });
            prismaMock.salesInvoice.count.mockResolvedValue(0);
            prismaMock.taxRate.findMany.mockResolvedValue([]);
            generateDocumentNumberMock.mockResolvedValue("INV-2602-9999");

            await expect(
                SalesInvoiceService.create(MOCK_INVOICE_INPUT, MOCK_USER_ID),
            ).rejects.toThrow("Invoice number already exists");
        });

        it("enqueues SALES_INVOICE_CREATED integration event", async () => {
            prismaMock.salesInvoice.count.mockResolvedValue(0);
            prismaMock.salesInvoice.findUnique.mockResolvedValue(null);
            prismaMock.taxRate.findMany.mockResolvedValue([]);

            generateDocumentNumberMock.mockResolvedValue("INV-2602-0001");

            const createdInvoice = {
                id: "cinv000000000000000000003",
                invoiceNumber: "INV-2602-0001",
                totalAmount: 200,
            };

            prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
                const tx = {
                    salesInvoice: {
                        create: vi.fn().mockResolvedValue(createdInvoice),
                    },
                    integrationOutbox: {
                        create: vi.fn().mockResolvedValue({ id: "outbox-003" }),
                    },
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (cb as any)(tx);
            });

            await SalesInvoiceService.create(MOCK_INVOICE_INPUT, MOCK_USER_ID);

            expect(enqueueIntegrationEventMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    type: "SALES_INVOICE_CREATED",
                    aggregateType: "SalesInvoice",
                    payload: expect.objectContaining({
                        invoiceId: "cinv000000000000000000003",
                        userId: MOCK_USER_ID,
                    }),
                }),
            );
        });
    });
});
