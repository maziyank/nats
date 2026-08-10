import { prisma } from "@/services/lib/prisma";
import { ReportContext } from "@/services/lib/reporting/types";

export interface PurchaseOrderReportData {
  order: any;
}

export async function getPurchaseOrderData(input: { orderId: string }): Promise<PurchaseOrderReportData> {
  const order = await prisma.purchaseOrder.findUnique({
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
    throw new Error(`Purchase Order with ID ${input.orderId} not found`);
  }

  return { order };
}
