import { describe, it, expect, vi, beforeEach } from "vitest";
import { POSTransactionService } from "./pos-transaction.service";
import { Decimal } from "decimal.js";

// Mock dependencies
const enqueueIntegrationEventOnceMock = vi.hoisted(() => vi.fn());
const maybeProcessIntegrationOutboxEventMock = vi.hoisted(() => vi.fn());
const createInventoryMovementMock = vi.hoisted(() => vi.fn());
const generateDocumentNumberMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/integration/outbox", () => ({
    enqueueIntegrationEventOnce: enqueueIntegrationEventOnceMock,
    maybeProcessIntegrationOutboxEvent: maybeProcessIntegrationOutboxEventMock,
}));

vi.mock("@/modules/inventory/services/inventory.service", () => ({
    InventoryService: {
        createInventoryMovement: createInventoryMovementMock,
    },
}));

vi.mock("@/lib/document-numbering", () => ({
    generateDocumentNumber: generateDocumentNumberMock,
}));

const prismaMock = vi.hoisted(() => ({
    $transaction: vi.fn(),
    pOSSession: {
        findUnique: vi.fn(),
    },
    contact: {
        findFirst: vi.fn(),
        create: vi.fn(),
    },
    salesOrder: {
        create: vi.fn(),
    },
    salesInvoice: {
        create: vi.fn(),
    },
    cashAccount: {
        findFirst: vi.fn(),
    },
    salesPayment: {
        create: vi.fn(),
    },
    salesShipment: {
        create: vi.fn(),
    },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

describe("POSTransactionService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("process", () => {
        const mockSessionId = "cses000000000000000000001";
        const mockItems = [
            { productId: "cpro000000000000000000001", quantity: 2, price: 100, discount: 0 }
        ];
        const mockPaymentMethod = "CASH";
        const mockAmountPaid = 200;

        it("should process a POS transaction successfully", async () => {
            // Mock $transaction to execute callback immediately
            prismaMock.$transaction.mockImplementation(async (callback: any) => {
                return callback(prismaMock);
            });

            // Mock Session Validation
            prismaMock.pOSSession.findUnique.mockResolvedValue({
                id: mockSessionId,
                status: "OPEN",
                warehouseId: "wh-1",
                cashierId: "user-1"
            });

            // Mock Customer Resolution (Walk-in)
            prismaMock.contact.findFirst.mockResolvedValue({ id: "contact-walk-in", name: "Walk-in Customer" });

            // Mock Sales Order Creation
            const mockSalesOrder = {
                id: "so-1",
                orderNumber: "SO-POS-1",
                totalAmount: new Decimal(200),
                items: [{ id: "so-item-1", productId: "cpro000000000000000000001", quantity: 2 }]
            };
            prismaMock.salesOrder.create.mockResolvedValue(mockSalesOrder);

            // Mock Sales Invoice Creation
            const mockInvoice = {
                id: "inv-1",
                invoiceNumber: "INV-POS-1",
                invoiceDate: new Date(),
                totalAmount: new Decimal(200),
                globalDiscount: new Decimal(0)
            };
            prismaMock.salesInvoice.create.mockResolvedValue(mockInvoice);

            // Mock Cash Account
            prismaMock.cashAccount.findFirst.mockResolvedValue({ id: "cash-acc-1" });

            // Mock Payment Creation
            const mockPayment = {
                id: "pay-1",
                paymentNumber: "PAY-POS-1",
                paymentDate: new Date(),
                amount: new Decimal(200),
                reference: "INV-POS-1",
                cashAccountId: "cash-acc-1",
                contactId: "contact-walk-in",
                salesInvoiceId: "inv-1"
            };
            prismaMock.salesPayment.create.mockResolvedValue(mockPayment);

            // Mock Shipment Creation
            const mockShipment = {
                id: "shp-1",
                shipmentNumber: "SHP-POS-1",
                items: [{ productId: "cpro000000000000000000001", quantity: 2 }]
            };
            prismaMock.salesShipment.create.mockResolvedValue(mockShipment);

            // Mock Inventory Movement (Resolved via mock above)
            createInventoryMovementMock.mockResolvedValue({});

            // Mock Outbox Enqueue responses
            enqueueIntegrationEventOnceMock
                .mockResolvedValueOnce({ id: "outbox-inv", alreadyQueued: false }) // Invoice
                .mockResolvedValueOnce({ id: "outbox-pay", alreadyQueued: false }) // Payment
                .mockResolvedValueOnce({ id: "outbox-order", alreadyQueued: false }) // Order
                .mockResolvedValueOnce({ id: "outbox-ship", alreadyQueued: false }); // Shipment

            // Mock Outbox Processing
            maybeProcessIntegrationOutboxEventMock.mockResolvedValue({ processed: true });

            // Mock document-number generation (order/invoice/payment/shipment)
            generateDocumentNumberMock.mockResolvedValue("DOC-1");

            // Execute
            const result = await POSTransactionService.process(
                mockSessionId,
                mockItems,
                mockPaymentMethod,
                mockAmountPaid
            );

            // Verifications

            // 1. Session Validated
            expect(prismaMock.pOSSession.findUnique).toHaveBeenCalledWith({ where: { id: mockSessionId } });

            // 2. Sales Order Created
            expect(prismaMock.salesOrder.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    contactId: "contact-walk-in",
                    posSessionId: mockSessionId,
                    totalAmount: new Decimal(200),
                })
            }));

            // 3. Invoice Created
            expect(prismaMock.salesInvoice.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    salesOrderId: "so-1",
                    totalAmount: new Decimal(200),
                })
            }));

            // 4. Payment Created
            expect(prismaMock.salesPayment.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    salesInvoiceId: "inv-1",
                    amount: new Decimal(200),
                    contactId: "contact-walk-in",
                })
            }));

            // 5. Shipment Created
            expect(prismaMock.salesShipment.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    salesOrderId: "so-1",
                })
            }));

            // 6. Inventory Movement Triggered
            expect(createInventoryMovementMock).toHaveBeenCalledWith(prismaMock, expect.objectContaining({
                type: "OUT",
                reference: "SHP-POS-1",
                warehouseId: "wh-1",
                items: expect.arrayContaining([
                    expect.objectContaining({ productId: "cpro000000000000000000001", quantity: 2 })
                ])
            }));

            // 7. Events Enqueued
            expect(enqueueIntegrationEventOnceMock).toHaveBeenCalledTimes(4); // Invoice + Payment + Order + Shipment

            // 8. Outbox processing is invoked (async by default; processed flag depends on env)
            expect(maybeProcessIntegrationOutboxEventMock).toHaveBeenCalled();
            expect(result.invoiceId).toBe("inv-1");
            expect(result.outbox).toBeDefined();
        });

        it("should throw error if session is not open", async () => {
            prismaMock.$transaction.mockImplementation(async (callback: any) => {
                return callback(prismaMock);
            });

            prismaMock.pOSSession.findUnique.mockResolvedValue({
                id: mockSessionId,
                status: "CLOSED" // Closed
            });

            await expect(POSTransactionService.process(
                mockSessionId,
                mockItems,
                mockPaymentMethod,
                mockAmountPaid
            )).rejects.toThrow("Session is not open");
        });
    });
});
