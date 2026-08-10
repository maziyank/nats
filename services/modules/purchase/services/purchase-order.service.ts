import { prisma } from "@/services/lib/prisma";
import { enqueueIntegrationEvent } from "@/services/modules/integration/outbox";
import { PurchaseOrderInput } from "@/app/[locale]/(dashboard)/purchase/orders/types";
import { generateDocumentNumber } from "@/services/lib/document-numbering";
import { CalculationService } from "@/services/lib/utils/calculation-service";
import { purchaseOrderSchema } from "@/services/lib/validation/schemas";

const INITIAL_DRAFT_STATUS = "DRAFT" as const;

export class PurchaseOrderService {
  static async create(data: PurchaseOrderInput, userId: string) {
    purchaseOrderSchema.parse(data);
    const orderNumber = `DRAFT-${Date.now()}`;

    const { itemsData, totals } = this.calculateItemsAndTotals(data);

    return await prisma.$transaction(async (tx) => {
      const result = await tx.purchaseOrder.create({
        data: {
          orderNumber,
          contactId: data.contactId,
          orderDate: data.orderDate,
          expectedDate: data.expectedDate,
          notes: data.notes,
          status: INITIAL_DRAFT_STATUS,
          totalAmount: totals.totalAmount.toNumber(),
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
        topic: "PURCHASE",
        type: "PURCHASE_ORDER_CREATED",
        aggregateType: "PurchaseOrder",
        aggregateId: result.id,
        payload: {
          orderId: result.id,
          orderNumber: result.orderNumber,
          totalAmount: result.totalAmount.toString(),
          userId,
        },
      });

      return result;
    });
  }

  static async update(id: string, data: PurchaseOrderInput, userId: string) {
    purchaseOrderSchema.parse(data);
    const currentOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!currentOrder) {
      throw new Error("Order not found");
    }

    if (currentOrder.status !== INITIAL_DRAFT_STATUS) {
      throw new Error(
        "Only Draft orders can be modified. Please Cancel or create a new order.",
      );
    }

    const { itemsData, totals } = this.calculateItemsAndTotals(data);

    return await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id },
      });

      return await tx.purchaseOrder.update({
        where: { id },
        data: {
          contactId: data.contactId,
          orderDate: data.orderDate,
          expectedDate: data.expectedDate,
          notes: data.notes,
          status: INITIAL_DRAFT_STATUS,
          totalAmount: totals.totalAmount.toNumber(),
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

  static async issue(id: string, userId: string) {
    const currentOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!currentOrder) {
      throw new Error("Order not found");
    }

    if (currentOrder.status !== "DRAFT") {
      throw new Error("Only Draft orders can be issued");
    }

    const orderNumber = await this.generatePONumber();

    return await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: "ISSUED",
        orderNumber,
        issuedAt: new Date(),
        issuedById: userId,
      },
    });
  }

  static async cancel(id: string, userId: string) {
    const currentOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!currentOrder) {
      throw new Error("Order not found");
    }

    if (!["DRAFT", "ISSUED"].includes(currentOrder.status)) {
      throw new Error("Cannot cancel this order");
    }

    return await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: userId,
      },
    });
  }

  static async close(id: string, userId: string) {
    const currentOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!currentOrder) {
      throw new Error("Order not found");
    }

    if (!["ISSUED", "PARTIALLY_RECEIVED"].includes(currentOrder.status)) {
      throw new Error("Cannot close this order");
    }

    return await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedById: userId,
      },
    });
  }

  static async delete(id: string) {
    const currentOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!currentOrder) {
      throw new Error("Order not found");
    }

    if (currentOrder.status !== "DRAFT") {
      throw new Error("Can only delete draft orders");
    }

    await prisma.purchaseOrder.delete({
      where: { id },
    });
  }

  private static async generatePONumber() {
    return await generateDocumentNumber(
      "PURCHASE_ORDER",
      "Purchase Order",
      "PO-",
    );
  }

  private static calculateItemsAndTotals(
    data: Pick<PurchaseOrderInput, "items">,
  ) {
    const itemsWithCalculations = data.items.map((item) => {
      const calculated = CalculationService.calculateLineItem({
        quantity: item.quantity,
        unitPrice: item.unitCost,
        discount: 0,
        tax: 0,
      });

      return {
        itemData: {
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: calculated.total.toNumber(),
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
