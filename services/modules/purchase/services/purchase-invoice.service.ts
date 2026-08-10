import { prisma } from "@/services/lib/prisma";
import { enqueueIntegrationEvent } from "@/services/modules/integration/outbox";
import { PurchaseInvoiceInput } from "@/app/[locale]/(dashboard)/purchase/invoices/types";
import { CalculationService } from "@/services/lib/calculation-service";
import { purchaseInvoiceSchema } from "@/services/lib/validation/schemas";

const INITIAL_DRAFT_STATUS = "DRAFT" as const;

export class PurchaseInvoiceService {
  static async create(data: PurchaseInvoiceInput, userId: string) {
    purchaseInvoiceSchema.parse(data);
    await this.assertUniqueInvoiceNumber(data.invoiceNumber, data.contactId);

    const taxRates = await prisma.taxRate.findMany();
    const { itemsData, totals } = this.calculateItemsAndTotals(data, taxRates);

    return await prisma.$transaction(async (tx) => {
      const result = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber: data.invoiceNumber,
          contactId: data.contactId,
          purchaseOrderId: data.purchaseOrderId,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          notes: data.notes,
          status: INITIAL_DRAFT_STATUS,
          totalAmount: totals.totalAmount.toNumber(),
          globalDiscount: data.globalDiscount,
          totalTax: totals.totalTax.toNumber(),
          shippingCost: data.shippingCost,
          handlingCost: data.handlingCost,
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
        type: "PURCHASE_INVOICE_CREATED",
        aggregateType: "PurchaseInvoice",
        aggregateId: result.id,
        payload: {
          invoiceId: result.id,
          invoiceNumber: result.invoiceNumber,
          totalAmount: result.totalAmount.toString(),
          contactId: data.contactId,
          userId,
        },
      });

      return result;
    });
  }

  static async update(id: string, data: PurchaseInvoiceInput, userId: string) {
    purchaseInvoiceSchema.parse(data);
    const currentInvoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
    });

    if (!currentInvoice) {
      throw new Error("Invoice not found");
    }

    if (
      currentInvoice.status === "PAID" ||
      currentInvoice.status === "CANCELED"
    ) {
      throw new Error("Cannot edit paid or cancelled invoice");
    }

    if (data.invoiceNumber !== currentInvoice.invoiceNumber) {
      await this.assertUniqueInvoiceNumber(data.invoiceNumber, data.contactId);
    }

    const taxRates = await prisma.taxRate.findMany();
    const { itemsData, totals } = this.calculateItemsAndTotals(data, taxRates);

    return await prisma.$transaction(async (tx) => {
      await tx.purchaseInvoiceItem.deleteMany({
        where: { purchaseInvoiceId: id },
      });

      return await tx.purchaseInvoice.update({
        where: { id },
        data: {
          invoiceNumber: data.invoiceNumber,
          contactId: data.contactId,
          purchaseOrderId: data.purchaseOrderId,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          notes: data.notes,
          totalAmount: totals.totalAmount.toNumber(),
          globalDiscount: data.globalDiscount,
          totalTax: totals.totalTax.toNumber(),
          shippingCost: data.shippingCost,
          handlingCost: data.handlingCost,
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
    const currentInvoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
    });

    if (!currentInvoice) {
      throw new Error("Invoice not found");
    }

    if (currentInvoice.status !== INITIAL_DRAFT_STATUS) {
      throw new Error("Can only delete draft invoices");
    }

    await prisma.purchaseInvoice.delete({
      where: { id },
    });
  }

  private static async assertUniqueInvoiceNumber(
    invoiceNumber: string,
    contactId: string,
  ): Promise<void> {
    const existing = await prisma.purchaseInvoice.findUnique({
      where: {
        contactId_invoiceNumber: {
          contactId,
          invoiceNumber,
        },
      },
    });

    if (existing) {
      throw new Error("Invoice number already exists for this vendor");
    }
  }

  private static calculateItemsAndTotals(
    data: Pick<
      PurchaseInvoiceInput,
      "items" | "globalDiscount" | "shippingCost" | "handlingCost"
    >,
    taxRates: { id: string; rate: unknown }[],
  ) {
    const itemsWithCalculations = data.items.map((item) => {
      let taxRateSnapshot: number | undefined = undefined;
      const taxAmount = item.tax || 0;

      if (item.taxRateId) {
        const rateObj = taxRates.find((r) => r.id === item.taxRateId);
        if (rateObj) {
          taxRateSnapshot = Number(rateObj.rate);
        }
      }

      const calculated = CalculationService.calculateLineItem(
        {
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: taxAmount,
        },
        taxRateSnapshot,
      );

      return {
        itemData: {
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: calculated.total.toNumber(),
          discount: item.discount,
          tax: calculated.taxAmount.toNumber(),
          taxRateId: item.taxRateId,
          taxRateSnapshot,
          productId: (
            item as PurchaseInvoiceInput["items"][number] & {
              productId?: string;
            }
          ).productId,
          accountId: item.accountId,
          purchaseOrderItemId: (
            item as PurchaseInvoiceInput["items"][number] & {
              purchaseOrderItemId?: string;
            }
          ).purchaseOrderItemId,
        },
        calculated,
      };
    });

    const totals = CalculationService.calculateInvoiceTotals(
      itemsWithCalculations.map((i) => i.calculated),
      data.globalDiscount,
      data.shippingCost,
      data.handlingCost,
    );

    return {
      itemsData: itemsWithCalculations.map((i) => i.itemData),
      totals,
    };
  }
}
