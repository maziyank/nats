import { prisma } from "@/services/lib/prisma";
import { ReportContext } from "@/services/lib/reporting/types";

export interface SalesInvoiceReportData {
  invoice: any;
}

export async function getSalesInvoiceData(input: { invoiceId: string }): Promise<SalesInvoiceReportData> {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      contact: true,
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new Error(`Sales Invoice with ID ${input.invoiceId} not found`);
  }

  return { invoice };
}
