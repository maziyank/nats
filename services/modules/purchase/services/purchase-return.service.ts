import { prisma } from "@/services/lib/prisma";
import { enqueueIntegrationEvent } from "@/services/modules/integration/outbox";
import { PurchaseReturnInput } from "@/app/[locale]/(dashboard)/purchase/returns/types";
import { CalculationService } from "@/services/lib/utils/calculation-service";
import { purchaseReturnSchema } from "@/services/lib/validation/schemas";

const INITIAL_DRAFT_STATUS = "DRAFT" as const;

export class PurchaseReturnService {
  static async create(data: PurchaseReturnInput, userId: string) {
    purchaseReturnSchema.parse(data);
    await this.assertUniqueReturnNumber(data.returnNumber);

    const itemsWithCalculations = data.items.map((item) => {
      const calculated = CalculationService.calculateLineItem({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: 0,
        tax: 0,
      });
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

    const totalAmount = totals.totalAmount.toNumber();

    return await prisma.$transaction(async (tx) => {
      const result = await tx.purchaseReturn.create({
        data: {
          returnNumber: data.returnNumber,
          contactId: data.contactId,
          purchaseOrderId: data.purchaseOrderId || undefined,
          purchaseInvoiceId: data.purchaseInvoiceId || undefined,
          departmentId: data.departmentId,
          projectId: data.projectId,
          returnDate: data.returnDate,
          reason: data.reason,
          notes: data.notes,
          status: INITIAL_DRAFT_STATUS,
          totalAmount,
          createdById: userId,
          items: {
            create: itemsWithCalculations.map((i) => ({
              productId: i.itemData.productId,
              quantity: i.itemData.quantity,
              unitPrice: i.itemData.unitPrice,
              totalPrice: i.itemData.totalPrice,
            })),
          },
          attachments: data.attachmentIds
            ? { connect: data.attachmentIds.map((id) => ({ id })) }
            : undefined,
        },
        include: {
          items: true,
        },
      });

      await enqueueIntegrationEvent(tx, {
        topic: "PURCHASE",
        type: "PURCHASE_RETURN_CREATED",
        aggregateType: "PurchaseReturn",
        aggregateId: result.id,
        payload: {
          returnId: result.id,
          returnNumber: result.returnNumber,
          totalAmount: result.totalAmount.toString(),
          contactId: data.contactId,
          userId,
        },
      });

      return result;
    });
  }

  static async update(id: string, data: PurchaseReturnInput, userId: string) {
    purchaseReturnSchema.parse(data);
    const currentReturn = await prisma.purchaseReturn.findUnique({
      where: { id },
    });

    if (!currentReturn) {
      throw new Error("Return not found");
    }

    if (currentReturn.status !== INITIAL_DRAFT_STATUS) {
      throw new Error("Only draft returns can be modified");
    }

    const itemsWithCalculations = data.items.map((item) => {
      const calculated = CalculationService.calculateLineItem({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: 0,
        tax: 0,
      });
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

    return await prisma.$transaction(async (tx) => {
      await tx.purchaseReturnItem.deleteMany({
        where: { purchaseReturnId: id },
      });

      return await tx.purchaseReturn.update({
        where: { id },
        data: {
          contactId: data.contactId,
          purchaseOrderId: data.purchaseOrderId || undefined,
          purchaseInvoiceId: data.purchaseInvoiceId || undefined,
          departmentId: data.departmentId,
          projectId: data.projectId,
          returnDate: data.returnDate,
          reason: data.reason,
          notes: data.notes,
          totalAmount: totals.totalAmount.toNumber(),
          updatedById: userId,
          items: {
            create: itemsWithCalculations.map((i) => ({
              productId: i.itemData.productId,
              quantity: i.itemData.quantity,
              unitPrice: i.itemData.unitPrice,
              totalPrice: i.itemData.totalPrice,
            })),
          },
          attachments: data.attachmentIds
            ? { set: data.attachmentIds.map((id) => ({ id })) }
            : undefined,
        },
        include: {
          items: true,
        },
      });
    });
  }

  static async delete(id: string) {
    const currentReturn = await prisma.purchaseReturn.findUnique({
      where: { id },
    });

    if (!currentReturn) {
      throw new Error("Return not found");
    }

    if (currentReturn.status !== INITIAL_DRAFT_STATUS) {
      throw new Error("Can only delete draft returns");
    }

    await prisma.purchaseReturn.delete({
      where: { id },
    });
  }

  private static async assertUniqueReturnNumber(
    returnNumber: string,
  ): Promise<void> {
    const existing = await prisma.purchaseReturn.findUnique({
      where: { returnNumber },
    });

    if (existing) {
      throw new Error("Return number already exists");
    }
  }
}
