import { prisma } from "@/services/lib/prisma";
import { ReportContext } from "@/services/lib/reporting/types";

export interface SalesOrderReportData {
  order: any; // Using any for now to avoid strict type matching with Prisma payload
}

export async function getSalesOrderData(input: { orderId: string }): Promise<SalesOrderReportData> {
  const order = await prisma.salesOrder.findUnique({
    where: { id: input.orderId },
    include: {
      contact: true,
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error(`Sales Order with ID ${input.orderId} not found`);
  }

  return { order };
}
