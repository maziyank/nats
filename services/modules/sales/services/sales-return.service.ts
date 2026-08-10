import { prisma } from "@/services/lib/prisma";
import { enqueueIntegrationEvent } from "@/services/modules/integration/outbox";
import { SalesReturnInput } from "@/app/[locale]/(dashboard)/sales/returns/types";
import { generateDocumentNumber } from "@/services/lib/document-numbering";
import { CalculationService } from "@/services/lib/calculation-service";
import { z } from "zod";
import { requiredIdSchema, dateSchema } from "@/services/lib/validation/schemas";

const INITIAL_DRAFT_STATUS = "DRAFT" as const;

const salesReturnSchema: z.ZodType<SalesReturnInput> = z.object({
  returnNumber: z.string().min(1, "Return number is required"),
  contactId: requiredIdSchema,
  salesOrderId: z.string().optional(),
  salesInvoiceId: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  returnDate: dateSchema,
  reason: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["DRAFT", "APPROVED", "COMPLETED", "CANCELLED"]).optional(),
  items: z
    .array(
      z.object({
        productId: requiredIdSchema,
        quantity: z.coerce.number().positive(),
        unitPrice: z.coerce.number().nonnegative(),
      }),
    )
    .min(1, "At least 1 item required"),
  attachmentIds: z.array(z.string()).optional(),
});

export class SalesReturnService {
  static async create(data: SalesReturnInput, userId: string) {
    data = salesReturnSchema.parse(data);

    const returnNumber =
      data.returnNumber || (await this.generateReturnNumber());

    await this.assertUniqueReturnNumber(returnNumber);

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
      const result = await tx.salesReturn.create({
        data: {
          returnNumber,
          contactId: data.contactId,
          salesOrderId: data.salesOrderId || undefined,
          salesInvoiceId: data.salesInvoiceId || undefined,
          departmentId: data.departmentId,
          projectId: data.projectId,
          returnDate: data.returnDate,
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
        topic: "SALES",
        type: "SALES_RETURN_CREATED",
        aggregateType: "SalesReturn",
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

  static async update(id: string, data: SalesReturnInput, userId: string) {
    const currentReturn = await prisma.salesReturn.findUnique({
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
      await tx.salesReturnItem.deleteMany({
        where: { salesReturnId: id },
      });

      return await tx.salesReturn.update({
        where: { id },
        data: {
          contactId: data.contactId,
          salesOrderId: data.salesOrderId || undefined,
          salesInvoiceId: data.salesInvoiceId || undefined,
          departmentId: data.departmentId,
          projectId: data.projectId,
          returnDate: data.returnDate,
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
    requiredIdSchema.parse(id);
    const currentReturn = await prisma.salesReturn.findUnique({
      where: { id },
    });

    if (!currentReturn) {
      throw new Error("Return not found");
    }

    if (currentReturn.status !== INITIAL_DRAFT_STATUS) {
      throw new Error("Can only delete draft returns");
    }

    await prisma.salesReturn.delete({
      where: { id },
    });
  }

  private static async generateReturnNumber(): Promise<string> {
    return await generateDocumentNumber("SALES_RETURN", "Sales Return", "RET-");
  }

  private static async assertUniqueReturnNumber(
    returnNumber: string,
  ): Promise<void> {
    const existing = await prisma.salesReturn.findUnique({
      where: { returnNumber },
    });

    if (existing) {
      throw new Error("Return number already exists");
    }
  }
}
