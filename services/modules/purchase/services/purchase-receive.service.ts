import { prisma } from "@/services/lib/prisma";
import { enqueueIntegrationEvent } from "@/services/modules/integration/outbox";
import { PurchaseReceiveInput } from "@/app/[locale]/(dashboard)/purchase/receives/types";
import { generateDocumentNumber } from "@/services/lib/document-numbering";
import { purchaseReceiveSchema } from "@/services/lib/validation/schemas";

const INITIAL_DRAFT_STATUS = "DRAFT" as const;

export class PurchaseReceiveService {
  static async create(data: PurchaseReceiveInput, userId: string) {
    purchaseReceiveSchema.parse(data);
    const receiveNumber = await this.generateReceiveNumber();

    return await prisma.$transaction(async (tx) => {
      const result = await tx.purchaseReceive.create({
        data: {
          receiveNumber,
          contactId: data.contactId,
          purchaseOrderId: data.purchaseOrderId,
          departmentId: data.departmentId,
          projectId: data.projectId,
          receiveDate: data.receiveDate,
          notes: data.notes,
          status: INITIAL_DRAFT_STATUS,
          createdById: userId,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              purchaseOrderItemId: item.purchaseOrderItemId,
            })),
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
        type: "PURCHASE_RECEIVE_CREATED",
        aggregateType: "PurchaseReceive",
        aggregateId: result.id,
        payload: {
          receiveId: result.id,
          receiveNumber: result.receiveNumber,
          contactId: data.contactId,
          userId,
        },
      });

      return result;
    });
  }

  static async delete(id: string) {
    const currentReceive = await prisma.purchaseReceive.findUnique({
      where: { id },
    });

    if (!currentReceive) {
      throw new Error("Receive not found");
    }

    if (currentReceive.status !== INITIAL_DRAFT_STATUS) {
      throw new Error("Can only delete draft receives");
    }

    await prisma.purchaseReceive.delete({
      where: { id },
    });
  }

  private static async generateReceiveNumber(): Promise<string> {
    return await generateDocumentNumber(
      "PURCHASE_RECEIVE",
      "Purchase Receive",
      "RCV-",
    );
  }
}
