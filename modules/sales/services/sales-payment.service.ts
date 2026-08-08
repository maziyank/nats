import { prisma } from "@/lib/prisma";
import { enqueueIntegrationEvent } from "@/modules/integration/outbox";
import { SalesPaymentInput } from "@/app/[locale]/(dashboard)/sales/payments/types";
import { generateDocumentNumber } from "@/lib/document-numbering";
import { Decimal } from "decimal.js";
import { salesPaymentSchema } from "@/lib/validation/schemas";

const OVERPAYMENT_TOLERANCE = 0.01;

type CreateSalesPaymentInput = Omit<SalesPaymentInput, "paymentNumber"> & {
  paymentNumber?: string;
};

export class SalesPaymentService {
  static async create(data: CreateSalesPaymentInput, userId: string) {
    data = salesPaymentSchema.parse(data);

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: data.salesInvoiceId },
      include: { payments: true },
    });

    if (!invoice) throw new Error("Invoice not found");

    const cashAccount = await prisma.cashAccount.findUnique({
      where: { id: data.cashAccountId },
    });

    if (!cashAccount) throw new Error("Cash account not found");

    const totalPaid = invoice.payments.reduce(
      (sum, p) => sum.plus(new Decimal(p.amount)),
      new Decimal(0),
    );
    const remaining = new Decimal(invoice.totalAmount).minus(totalPaid);

    if (
      new Decimal(data.amount).greaterThan(
        remaining.plus(OVERPAYMENT_TOLERANCE),
      )
    ) {
      throw new Error(`Amount exceeds remaining balance of ${remaining}`);
    }

    const paymentNumber =
      data.paymentNumber || (await this.generatePaymentNumber());

    return await prisma.$transaction(async (tx) => {
      const payment = await tx.salesPayment.create({
        data: {
          paymentNumber,
          contactId: data.contactId,
          salesInvoiceId: data.salesInvoiceId,
          paymentDate: data.paymentDate,
          amount: data.amount,
          reference: data.reference,
          notes: data.notes,
          method: data.method,
          departmentId: data.departmentId,
          projectId: data.projectId,
          cashAccountId: data.cashAccountId,
          createdById: userId,
          attachments: {
            connect: data.attachmentIds?.map((id) => ({ id })),
          },
        },
      });

      const newTotalPaid = totalPaid.plus(new Decimal(data.amount));
      const newStatus = newTotalPaid.greaterThanOrEqualTo(
        new Decimal(invoice.totalAmount).minus(OVERPAYMENT_TOLERANCE),
      )
        ? "PAID"
        : "PARTIALLY_PAID";

      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { status: newStatus },
      });

      await enqueueIntegrationEvent(tx, {
        topic: "SALES",
        type: "SALES_PAYMENT_CREATED",
        aggregateType: "SalesPayment",
        aggregateId: payment.id,
        payload: {
          paymentId: payment.id,
          paymentNumber: payment.paymentNumber,
          amount: payment.amount.toString(),
          salesInvoiceId: data.salesInvoiceId,
          contactId: data.contactId,
          userId,
        },
      });

      return payment;
    });
  }

  private static async generatePaymentNumber(): Promise<string> {
    return await generateDocumentNumber(
      "SALES_PAYMENT",
      "Sales Payment",
      "PAY-IN-",
    );
  }
}
