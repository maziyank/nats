import { prisma } from "@/services/lib/prisma";
import { generateDocumentNumber } from "@/services/lib/document-numbering";

export interface ProductionOrderInput {
    billOfMaterialId?: string;
    productId: string;
    plannedQuantity: number;
    startDate?: Date;
    endDate?: Date;
    notes?: string;
}

export class ProductionOrderService {
    static async create(data: ProductionOrderInput) {
        const orderNumber = await generateDocumentNumber("PRODUCTION_ORDER", "Production Order", "PO-");

        return await prisma.$transaction(async (tx) => {
            const result = await tx.productionOrder.create({
                data: {
                    orderNumber,
                    billOfMaterialId: data.billOfMaterialId,
                    productId: data.productId,
                    plannedQuantity: data.plannedQuantity,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    notes: data.notes,
                    status: "DRAFT",
                },
                include: {
                    billOfMaterial: {
                        include: {
                            items: true,
                        },
                    },
                    product: true,
                },
            });

            return result;
        });
    }

    static async update(id: string, data: ProductionOrderInput) {
        return await prisma.productionOrder.update({
            where: { id, status: "DRAFT" },
            data: {
                billOfMaterialId: data.billOfMaterialId,
                productId: data.productId,
                plannedQuantity: data.plannedQuantity,
                startDate: data.startDate,
                endDate: data.endDate,
                notes: data.notes,
            },
        });
    }

    static async release(id: string) {
        return await prisma.productionOrder.update({
            where: { id },
            data: {
                status: "RELEASED",
            },
        });
    }

    static async markInProgress(id: string) {
        return await prisma.productionOrder.update({
            where: { id },
            data: {
                status: "IN_PROGRESS",
                actualStartDate: new Date(),
            },
        });
    }

    static async close(id: string) {
        return await prisma.productionOrder.update({
            where: { id },
            data: {
                status: "COMPLETED",
                actualEndDate: new Date(),
            },
        });
    }

    static async cancel(id: string) {
        return await prisma.productionOrder.update({
            where: { id },
            data: {
                status: "CANCELLED",
            },
        });
    }
}
