import { prisma } from "@/services/lib/prisma";
import { InventoryService } from "@/services/modules/inventory/services/inventory.service";
import { MovementType } from "@/prisma/generated/prisma/client";
import { Decimal } from "decimal.js";
import {
  enqueueIntegrationEventOnce,
  maybeProcessIntegrationOutboxEvent,
} from "@/services/modules/integration/outbox";
import { CalculationService } from "@/services/lib/utils/calculation-service";
import { generateDocumentNumber } from "@/services/lib/document-numbering";
import { z } from "zod";
import {
  requiredIdSchema,
  nonNegativeDecimalSchema,
} from "@/services/lib/validation/schemas";

const DEFAULT_WALK_IN_CUSTOMER_NAME = "Walk-in Customer";

const posTransactionItemSchema = z.object({
  productId: requiredIdSchema,
  quantity: z.number().positive("Quantity must be greater than 0"),
  price: nonNegativeDecimalSchema,
  discount: nonNegativeDecimalSchema,
});

const processPOSTransactionSchema = z.object({
  sessionId: requiredIdSchema,
  items: z.array(posTransactionItemSchema).min(1, "At least 1 item required"),
  paymentMethod: z.enum(["CASH", "CARD", "QRIS"]),
  amountPaid: nonNegativeDecimalSchema,
  globalDiscount: nonNegativeDecimalSchema.default(0),
  customerId: z.string().cuid().optional(),
});

interface POSTransactionItem {
  productId: string;
  quantity: number;
  price: number;
  discount: number;
}

interface POSTransactionOutboxResult {
  invoiceId: string;
  outbox: {
    outboxIds: string[];
    alreadyQueuedIds: string[];
    processed: boolean;
  };
}

export class POSTransactionService {
  static async process(
    sessionId: string,
    items: POSTransactionItem[],
    paymentMethod: "CASH" | "CARD" | "QRIS",
    amountPaid: number,
    globalDiscount: number = 0,
    customerId?: string,
  ): Promise<POSTransactionOutboxResult> {
    const parsed = processPOSTransactionSchema.parse({
      sessionId,
      items,
      paymentMethod,
      amountPaid,
      globalDiscount,
      customerId,
    });
    sessionId = parsed.sessionId;
    items = parsed.items;
    paymentMethod = parsed.paymentMethod;
    amountPaid = parsed.amountPaid;
    globalDiscount = parsed.globalDiscount;
    customerId = parsed.customerId;

    const result = await prisma.$transaction(async (tx) => {
      const session = await this.validateSession(tx, sessionId);
      const contactId = await this.resolveCustomer(tx, customerId);

      const itemsWithCalculations = items.map((item) => {
        const subtotal = new Decimal(item.price).mul(item.quantity);
        const discountPercent =
          subtotal.gt(0) && item.discount > 0
            ? new Decimal(item.discount).div(subtotal).mul(100)
            : new Decimal(0);

        const calculated = CalculationService.calculateLineItem({
          quantity: item.quantity,
          unitPrice: item.price,
          discount: discountPercent,
          tax: 0,
        });
        return { item, calculated, discountPercent };
      });

      const totals = CalculationService.calculateInvoiceTotals(
        itemsWithCalculations.map((i) => i.calculated),
        globalDiscount,
      );

      const salesOrder = await this.createSalesOrder(tx, {
        contactId,
        sessionId,
        cashierId: session.cashierId,
        itemsWithCalculations,
        subtotal: totals.itemsTotal.plus(
          itemsWithCalculations.reduce(
            (sum, i) => sum.plus(i.calculated.discountAmount),
            new Decimal(0),
          ),
        ),
        totalDiscount: itemsWithCalculations
          .reduce(
            (sum, i) => sum.plus(i.calculated.discountAmount),
            new Decimal(0),
          )
          .plus(globalDiscount),
        totalAmount: totals.totalAmount,
      });

      const salesInvoice = await this.createInvoice(tx, {
        contactId,
        salesOrderId: salesOrder.id,
        sessionId,
        cashierId: session.cashierId,
        itemsWithCalculations,
        subtotal: totals.itemsTotal.plus(
          itemsWithCalculations.reduce(
            (sum, i) => sum.plus(i.calculated.discountAmount),
            new Decimal(0),
          ),
        ),
        globalDiscount,
        totalAmount: totals.totalAmount,
      });

      const payment = await this.createPayment(tx, {
        contactId,
        invoiceNumber: salesInvoice.invoiceNumber,
        salesInvoiceId: salesInvoice.id,
        sessionId,
        paymentMethod,
        totalAmount: totals.totalAmount,
      });

      const shipment = await this.createShipment(tx, {
        contactId,
        salesOrderId: salesOrder.id,
        orderItems: salesOrder.items,
      });

      const orderOutbox = await this.enqueueSalesOrderEvent(tx, {
        salesOrder,
        cashierId: session.cashierId,
      });

      const shipmentOutbox = await this.enqueueShipmentEvent(tx, {
        shipment,
        contactId,
        cashierId: session.cashierId,
      });

      await InventoryService.createInventoryMovement(tx, {
        type: MovementType.OUT,
        reference: shipment.shipmentNumber,
        items: shipment.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        notes: `POS Sale ${salesOrder.orderNumber}`,
        transactionDate: new Date(),
        warehouseId: session.warehouseId || undefined,
      });

      const invoiceOutbox = await this.enqueueInvoiceEvent(tx, {
        salesInvoice,
        contactId,
        cashierId: session.cashierId,
        itemsWithCalculations,
      });

      const paymentOutbox = await this.enqueuePaymentEvent(tx, {
        payment,
        cashierId: session.cashierId,
      });

      const outboxIds = [
        invoiceOutbox.id,
        paymentOutbox.id,
        orderOutbox.id,
        shipmentOutbox.id,
      ];
      const alreadyQueuedIds = [
        ...(invoiceOutbox.alreadyQueued ? [invoiceOutbox.id] : []),
        ...(paymentOutbox.alreadyQueued ? [paymentOutbox.id] : []),
        ...(orderOutbox.alreadyQueued ? [orderOutbox.id] : []),
        ...(shipmentOutbox.alreadyQueued ? [shipmentOutbox.id] : []),
      ];

      return { invoiceId: salesInvoice.id, outboxIds, alreadyQueuedIds };
    });

    const processingResults = await Promise.all(
      result.outboxIds.map((outboxId) =>
        maybeProcessIntegrationOutboxEvent(outboxId),
      ),
    );

    return {
      invoiceId: result.invoiceId,
      outbox: {
        outboxIds: result.outboxIds,
        alreadyQueuedIds: result.alreadyQueuedIds,
        processed: processingResults.every((r) => r.processed),
      },
    };
  }

  private static async validateSession(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    sessionId: string,
  ) {
    const session = await tx.pOSSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status !== "OPEN") {
      throw new Error("Session is not open");
    }
    return session;
  }

  private static async resolveCustomer(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    customerId?: string,
  ): Promise<string> {
    if (customerId) return customerId;

    const walkIn = await tx.contact.findFirst({
      where: { name: DEFAULT_WALK_IN_CUSTOMER_NAME, type: "CUSTOMER" },
    });

    if (walkIn) return walkIn.id;

    const newWalkIn = await tx.contact.create({
      data: { name: DEFAULT_WALK_IN_CUSTOMER_NAME, type: "CUSTOMER" },
    });
    return newWalkIn.id;
  }

  private static calculateTotals(
    items: POSTransactionItem[],
    globalDiscount: number,
  ) {
    const subtotal = items.reduce(
      (acc, item) => acc.plus(new Decimal(item.price).mul(item.quantity)),
      new Decimal(0),
    );
    const totalItemDiscounts = items.reduce(
      (acc, item) => acc.plus(new Decimal(item.discount)),
      new Decimal(0),
    );
    const totalDiscount = totalItemDiscounts.plus(globalDiscount);
    const totalAmount = subtotal.minus(totalDiscount);

    return { subtotal, totalDiscount, totalAmount };
  }

  private static async createSalesOrder(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: {
      contactId: string;
      sessionId: string;
      cashierId: string;
      itemsWithCalculations: {
        item: POSTransactionItem;
        calculated: any;
        discountPercent: Decimal;
      }[];
      subtotal: Decimal;
      totalDiscount: Decimal;
      totalAmount: Decimal;
    },
  ) {
    const orderNumber = await generateDocumentNumber(
      "SALES_ORDER",
      "Sales Order",
      "SO-POS-",
    );
    return await tx.salesOrder.create({
      data: {
        orderNumber,
        contactId: params.contactId,
        status: "SHIPPED", // Equivalent to fully processed order
        orderDate: new Date(),
        confirmedAt: new Date(),
        confirmedById: params.cashierId,
        closedAt: new Date(),
        closedById: params.cashierId,
        subtotal: params.subtotal,
        discountAmount: params.totalDiscount,
        totalAmount: params.totalAmount,
        posSessionId: params.sessionId,
        items: {
          create: params.itemsWithCalculations.map(
            ({ item, calculated, discountPercent }) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: new Decimal(item.price),
              totalPrice: calculated.total.toNumber(),
              discountRate: discountPercent,
            }),
          ),
        },
      },
      include: { items: true },
    });
  }

  private static async createInvoice(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: {
      contactId: string;
      salesOrderId: string;
      sessionId: string;
      cashierId: string;
      itemsWithCalculations: {
        item: POSTransactionItem;
        calculated: any;
        discountPercent: Decimal;
      }[];
      subtotal: Decimal;
      globalDiscount: number;
      totalAmount: Decimal;
    },
  ) {
    const invoiceNumber = await generateDocumentNumber(
      "SALES_INVOICE",
      "Sales Invoice",
      "INV-POS-",
    );
    const invoiceDate = new Date();
    return await tx.salesInvoice.create({
      data: {
        invoiceNumber,
        contactId: params.contactId,
        salesOrderId: params.salesOrderId,
        invoiceDate,
        dueDate: invoiceDate,
        status: "PAID",
        subtotal: params.subtotal,
        globalDiscount: new Decimal(params.globalDiscount),
        totalAmount: params.totalAmount,
        balanceDue: new Decimal(0),
        posSessionId: params.sessionId,
        items: {
          create: params.itemsWithCalculations.map(
            ({ item, calculated, discountPercent }) => ({
              description: "POS Item",
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: new Decimal(item.price),
              totalPrice: calculated.total.toNumber(),
              discount: calculated.discountAmount.toNumber(),
            }),
          ),
        },
      },
      include: { items: true },
    });
  }

  private static async createPayment(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: {
      contactId: string;
      invoiceNumber: string;
      salesInvoiceId: string;
      sessionId: string;
      paymentMethod: "CASH" | "CARD" | "QRIS";
      totalAmount: Decimal;
    },
  ) {
    const paymentNumber = await generateDocumentNumber(
      "SALES_PAYMENT",
      "Sales Payment",
      "PAY-POS-",
    );
    const cashAccount = await tx.cashAccount.findFirst({
      where: { type: params.paymentMethod === "CASH" ? "CASH" : "BANK" },
    });

    if (!cashAccount) throw new Error("No Cash/Bank account configured");

    return await tx.salesPayment.create({
      data: {
        paymentNumber,
        contactId: params.contactId,
        amount: params.totalAmount,
        paymentDate: new Date(),
        method: params.paymentMethod,
        reference: params.invoiceNumber,
        cashAccountId: cashAccount.id,
        posSessionId: params.sessionId,
        salesInvoiceId: params.salesInvoiceId,
      },
    });
  }

  private static async createShipment(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: {
      contactId: string;
      salesOrderId: string;
      orderItems: { id: string; productId: string; quantity: number }[];
    },
  ) {
    const shipmentNumber = await generateDocumentNumber(
      "SALES_SHIPMENT",
      "Sales Shipment",
      "SHP-POS-",
    );
    return await tx.salesShipment.create({
      data: {
        shipmentNumber,
        salesOrderId: params.salesOrderId,
        contactId: params.contactId,
        status: "COMPLETED",
        shipmentDate: new Date(),
        items: {
          create: params.orderItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            salesOrderItemId: item.id,
          })),
        },
      },
      include: { items: true },
    });
  }

  private static async enqueueInvoiceEvent(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: {
      salesInvoice: {
        id: string;
        invoiceNumber: string;
        invoiceDate: Date;
        totalAmount: Decimal;
        globalDiscount: Decimal | null;
      };
      contactId: string;
      cashierId: string;
      itemsWithCalculations: {
        item: POSTransactionItem;
        calculated: any;
        discountPercent: Decimal;
      }[];
    },
  ) {
    return await enqueueIntegrationEventOnce(tx, {
      topic: "SALES",
      type: "SALES_INVOICE_ISSUED",
      aggregateType: "SalesInvoice",
      aggregateId: params.salesInvoice.id,
      payload: {
        invoiceId: params.salesInvoice.id,
        invoiceNumber: params.salesInvoice.invoiceNumber,
        invoiceDate: params.salesInvoice.invoiceDate.toISOString(),
        contactId: params.contactId,
        userId: params.cashierId,
        totalAmount: params.salesInvoice.totalAmount.toString(),
        globalDiscount: params.salesInvoice.globalDiscount?.toString(),
        shippingCost: undefined,
        items: params.itemsWithCalculations.map(
          ({ item, calculated, discountPercent }) => {
            return {
              description: `POS Item - ${item.productId}`,
              quantity: item.quantity,
              unitPrice: new Decimal(item.price).toString(),
              discount: discountPercent.toString(),
              tax: undefined,
              accountId: undefined,
            };
          },
        ),
      },
    });
  }

  private static async enqueuePaymentEvent(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: {
      payment: {
        id: string;
        paymentNumber: string;
        paymentDate: Date;
        amount: Decimal;
        reference: string | null;
        cashAccountId: string;
        contactId: string;
        salesInvoiceId: string | null;
      };
      cashierId: string;
    },
  ) {
    return await enqueueIntegrationEventOnce(tx, {
      topic: "SALES",
      type: "SALES_PAYMENT_POSTED",
      aggregateType: "SalesPayment",
      aggregateId: params.payment.id,
      payload: {
        paymentId: params.payment.id,
        paymentNumber: params.payment.paymentNumber,
        paymentDate: params.payment.paymentDate.toISOString(),
        amount: params.payment.amount.toString(),
        reference: params.payment.reference ?? undefined,
        notes: undefined,
        cashAccountId: params.payment.cashAccountId,
        contactId: params.payment.contactId,
        salesInvoiceId: params.payment.salesInvoiceId!,
        userId: params.cashierId,
      },
    });
  }

  private static async enqueueSalesOrderEvent(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: {
      salesOrder: { id: string; orderNumber: string; totalAmount: Decimal };
      cashierId: string;
    },
  ) {
    return await enqueueIntegrationEventOnce(tx, {
      topic: "SALES",
      type: "SALES_ORDER_CREATED",
      aggregateType: "SalesOrder",
      aggregateId: params.salesOrder.id,
      payload: {
        salesOrderId: params.salesOrder.id,
        orderNumber: params.salesOrder.orderNumber,
        totalAmount: params.salesOrder.totalAmount.toString(),
        userId: params.cashierId,
      },
    });
  }

  private static async enqueueShipmentEvent(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: {
      shipment: {
        id: string;
        shipmentNumber: string;
        salesOrderId: string | null;
      };
      contactId: string;
      cashierId: string;
    },
  ) {
    return await enqueueIntegrationEventOnce(tx, {
      topic: "SALES",
      type: "SALES_SHIPMENT_CREATED",
      aggregateType: "SalesShipment",
      aggregateId: params.shipment.id,
      payload: {
        shipmentId: params.shipment.id,
        shipmentNumber: params.shipment.shipmentNumber,
        salesOrderId: params.shipment.salesOrderId ?? undefined,
        contactId: params.contactId,
        userId: params.cashierId,
      },
    });
  }
}
