import { prisma } from "@/services/lib/prisma";
import { enqueueIntegrationEvent } from "@/services/modules/integration/outbox";
import { SalesOrderInput } from "@/app/[locale]/(dashboard)/sales/orders/types";
import { CalculationService } from "@/services/lib/utils/calculation-service";
import { generateDocumentNumber } from "@/services/lib/document-numbering";
import { SalesOrderStatus } from "@/prisma/generated/prisma/client";
import { z } from "zod";
import { requiredIdSchema, dateSchema } from "@/services/lib/validation/schemas";

const INITIAL_DRAFT_STATUS = "DRAFT" as const;

const salesOrderSchema: z.ZodType<SalesOrderInput> = z.object({
  contactId: requiredIdSchema,
  orderDate: dateSchema,
  expectedDate: dateSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.nativeEnum(SalesOrderStatus).optional(),
  items: z
    .array(
      z.object({
        productId: requiredIdSchema,
        quantity: z.coerce.number().positive(),
        unitPrice: z.coerce.number().nonnegative(),
        taxRate: z.coerce.number().optional(),
        discountRate: z.coerce.number().optional(),
      }),
    )
    .min(1, "At least 1 item required"),
  attachmentIds: z.array(z.string()).optional(),
  departmentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

export class SalesOrderService {
  static async create(data: SalesOrderInput, userId: string) {
    data = salesOrderSchema.parse(data);
    const orderNumber = `DRAFT-${Date.now()}`;

    const { itemsData, totals } = this.calculateItemsAndTotals(data);

    return await prisma.$transaction(async (tx) => {
      const result = await tx.salesOrder.create({
        data: {
          orderNumber,
          contactId: data.contactId,
          orderDate: data.orderDate,
          expectedDate: data.expectedDate,
          notes: data.notes,
          status: INITIAL_DRAFT_STATUS,
          totalAmount: totals.totalAmount.toNumber(),
          subtotal: totals.itemsTotal.toNumber(),
          taxAmount: totals.totalTax.toNumber(),
          discountAmount: 0,
          departmentId: data.departmentId,
          projectId: data.projectId,
          createdById: userId,
          items: {
            create: itemsData,
          },
          attachments: {
            connect: data.attachmentIds?.map((id) => ({ id })) || [],
          },
        },
        include: {
          items: true,
        },
      });

      await enqueueIntegrationEvent(tx, {
        topic: "SALES",
        type: "SALES_ORDER_CREATED",
        aggregateType: "sales_order",
        aggregateId: result.id,
        payload: {
          salesOrderId: result.id,
          orderNumber: result.orderNumber,
          totalAmount: result.totalAmount.toString(),
          userId,
        },
      });

      return result;
    });
  }

  static async update(id: string, data: SalesOrderInput, userId: string) {
    requiredIdSchema.parse(id);
    data = salesOrderSchema.parse(data);

    const currentOrder = await prisma.salesOrder.findUnique({
      where: { id },
    });

    if (!currentOrder) {
      throw new Error("Order not found");
    }

    if (currentOrder.status !== "DRAFT") {
      throw new Error(
        "Only Draft orders can be modified. Please Cancel or create a new order.",
      );
    }

    const { itemsData, totals } = this.calculateItemsAndTotals(data);

    return await prisma.$transaction(async (tx) => {
      await tx.salesOrderItem.deleteMany({
        where: { salesOrderId: id },
      });

      return await tx.salesOrder.update({
        where: { id },
        data: {
          contactId: data.contactId,
          orderDate: data.orderDate,
          expectedDate: data.expectedDate,
          notes: data.notes,
          status: INITIAL_DRAFT_STATUS,
          totalAmount: totals.totalAmount.toNumber(),
          subtotal: totals.itemsTotal.toNumber(),
          taxAmount: totals.totalTax.toNumber(),
          discountAmount: 0,
          departmentId: data.departmentId,
          projectId: data.projectId,
          updatedById: userId,
          items: {
            create: itemsData,
          },
          attachments: {
            set: data.attachmentIds?.map((id) => ({ id })) || [],
          },
        },
        include: {
          items: true,
        },
      });
    });
  }

  static async delete(id: string) {
    const currentOrder = await prisma.salesOrder.findUnique({
      where: { id },
    });

    if (!currentOrder) {
      throw new Error("Order not found");
    }

    if (currentOrder.status !== "DRAFT") {
      throw new Error("Can only delete draft orders");
    }

    await prisma.salesOrder.delete({
      where: { id },
    });
  }

  static async issue(id: string, userId: string) {
    const currentOrder = await prisma.salesOrder.findUnique({
      where: { id },
    });

    if (!currentOrder) {
      throw new Error("Order not found");
    }

    if (currentOrder.status !== "DRAFT") {
      throw new Error("Only Draft orders can be confirmed");
    }

    const orderNumber = await this.generateSONumber();

    return await prisma.salesOrder.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        orderNumber,
        confirmedAt: new Date(),
        confirmedById: userId,
      },
    });
  }

  static async cancel(id: string, userId: string) {
    const currentOrder = await prisma.salesOrder.findUnique({
      where: { id },
    });

    if (!currentOrder) {
      throw new Error("Order not found");
    }

    if (!["DRAFT", "CONFIRMED"].includes(currentOrder.status)) {
      throw new Error("Cannot cancel this order");
    }

    return await prisma.salesOrder.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: userId,
      },
    });
  }

  static async close(id: string, userId: string) {
    const currentOrder = await prisma.salesOrder.findUnique({
      where: { id },
    });

    if (!currentOrder) {
      throw new Error("Order not found");
    }

    if (
      !["CONFIRMED", "SHIPPED", "PARTIALLY_SHIPPED"].includes(
        currentOrder.status,
      )
    ) {
      throw new Error("Cannot close this order");
    }

    return await prisma.salesOrder.update({
      where: { id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedById: userId,
      },
    });
  }

  private static async generateSONumber(): Promise<string> {
    return await generateDocumentNumber("SALES_ORDER", "Sales Order", "SO-");
  }

  private static calculateItemsAndTotals(data: Pick<SalesOrderInput, "items">) {
    const itemsWithCalculations = data.items.map((item) => {
      const calculated = CalculationService.calculateLineItem(
        {
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discountRate,
          tax: 0,
        },
        item.taxRate,
      );

      return {
        itemData: {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: calculated.total.toNumber(),
        },
        calculated,
      };
    });

    const totals = CalculationService.calculateInvoiceTotals(
      itemsWithCalculations.map((i) => i.calculated),
    );

    return {
      itemsData: itemsWithCalculations.map((i) => i.itemData),
      totals,
    };
  }
}
