import { prisma } from "@/lib/prisma";
import { enqueueIntegrationEvent } from "@/modules/integration/outbox";
import { SalesInvoiceInput } from "@/app/[locale]/(dashboard)/sales/invoices/types";
import { CalculationService } from "@/lib/utils/calculation-service";
import { generateDocumentNumber } from "@/lib/document-numbering";
import { salesInvoiceSchema, requiredIdSchema } from "@/lib/validation/schemas";

const INITIAL_DRAFT_STATUS = "DRAFT" as const;

type CreateSalesInvoiceInput = Omit<SalesInvoiceInput, "invoiceNumber"> & {
  invoiceNumber?: string;
};

export class SalesInvoiceService {
  static async create(data: CreateSalesInvoiceInput, userId: string) {
    data = salesInvoiceSchema.parse(data);

    const invoiceNumber =
      data.invoiceNumber || (await this.generateInvoiceNumber());

    await this.assertUniqueInvoiceNumber(invoiceNumber);

    const taxRates = await prisma.taxRate.findMany();
    const { itemsData, totals } = this.calculateItemsAndTotals(data, taxRates);

    return await prisma.$transaction(async (tx) => {
      const result = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          contactId: data.contactId,
          salesOrderId: data.salesOrderId,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          notes: data.notes,
          status: INITIAL_DRAFT_STATUS,
          totalAmount: totals.totalAmount.toNumber(),
          globalDiscount: data.globalDiscount,
          totalTax: totals.totalTax.toNumber(),
          shippingCost: data.shippingCost,
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
        type: "SALES_INVOICE_CREATED",
        aggregateType: "SalesInvoice",
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

  static async update(
    id: string,
    data: CreateSalesInvoiceInput,
    userId: string,
  ) {
    requiredIdSchema.parse(id);
    data = salesInvoiceSchema.parse(data);

    // 1. Validation: Check if invoice exists and is editable
    const currentInvoice = await prisma.salesInvoice.findUnique({
      where: { id },
    });

    if (!currentInvoice) {
      throw new Error("Invoice not found");
    }

    if (
      currentInvoice.status === "PAID" ||
      currentInvoice.status === "CANCELLED"
    ) {
      throw new Error("Cannot edit paid or canceled invoice");
    }

    // 2. Invoice Number Uniqueness Check (if changed)
    if (
      data.invoiceNumber &&
      data.invoiceNumber !== currentInvoice.invoiceNumber
    ) {
      await this.assertUniqueInvoiceNumber(data.invoiceNumber, id);
    }

    // 3. Calculate Totals
    const taxRates = await prisma.taxRate.findMany();
    const { itemsData, totals } = this.calculateItemsAndTotals(data, taxRates);

    // 4. Update Transaction
    return await prisma.$transaction(async (tx) => {
      // Delete existing items
      await tx.salesInvoiceItem.deleteMany({
        where: { salesInvoiceId: id },
      });

      // Update Invoice and create new items
      const result = await tx.salesInvoice.update({
        where: { id },
        data: {
          invoiceNumber: data.invoiceNumber || currentInvoice.invoiceNumber,
          contactId: data.contactId,
          salesOrderId: data.salesOrderId,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          notes: data.notes,
          status: data.status || currentInvoice.status,
          totalAmount: totals.totalAmount.toNumber(),
          globalDiscount: data.globalDiscount,
          totalTax: totals.totalTax.toNumber(),
          shippingCost: data.shippingCost,
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

      return result;
    });
  }

  static async delete(id: string) {
    requiredIdSchema.parse(id);
    const currentInvoice = await prisma.salesInvoice.findUnique({
      where: { id },
    });

    if (!currentInvoice) {
      throw new Error("Invoice not found");
    }

    if (currentInvoice.status !== "DRAFT") {
      throw new Error("Can only delete draft invoices");
    }

    await prisma.salesInvoice.delete({
      where: { id },
    });
  }

  private static async generateInvoiceNumber(): Promise<string> {
    return await generateDocumentNumber(
      "SALES_INVOICE",
      "Sales Invoice",
      "INV-",
    );
  }

  private static async assertUniqueInvoiceNumber(
    invoiceNumber: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await prisma.salesInvoice.findUnique({
      where: { invoiceNumber },
    });

    if (existing && existing.id !== excludeId) {
      throw new Error("Invoice number already exists");
    }
  }

  private static calculateItemsAndTotals(
    data: Pick<SalesInvoiceInput, "items" | "globalDiscount" | "shippingCost">,
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
          productId: item.productId,
          accountId: item.accountId,
        },
        calculated,
      };
    });

    const totals = CalculationService.calculateInvoiceTotals(
      itemsWithCalculations.map((i) => i.calculated),
      data.globalDiscount,
      data.shippingCost,
    );

    return {
      itemsData: itemsWithCalculations.map((i) => i.itemData),
      totals,
    };
  }
}
