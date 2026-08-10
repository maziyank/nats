import { prisma } from "@/services/lib/prisma";

export interface POSReceiptData {
  invoice: any;
  payment: any;
  cashierName?: string | null;
}

export async function getPOSReceiptData(input: {
  invoiceId: string;
}): Promise<POSReceiptData> {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      contact: true,
      items: {
        include: {
          product: true,
        },
      },
      posSession: true,
    },
  });

  if (!invoice) {
    throw new Error(`Invoice with ID ${input.invoiceId} not found`);
  }

  let cashierName = null;
  if (invoice.posSession?.cashierId) {
    const user = await prisma.user.findUnique({
      where: { id: invoice.posSession.cashierId },
      select: { name: true },
    });
    cashierName = user?.name;
  }

  // Find associated payment
  const payment = await prisma.salesPayment.findFirst({
    where: {
      salesInvoiceId: input.invoiceId,
    },
  });

  return {
    invoice,
    payment,
    cashierName,
  };
}
