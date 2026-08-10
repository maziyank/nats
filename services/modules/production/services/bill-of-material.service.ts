import { prisma } from "@/services/lib/prisma";
import { generateDocumentNumber } from "@/services/lib/document-numbering";

export interface BillOfMaterialInput {
    name: string;
    description?: string;
    productId: string;
    quantity: number;
    isActive: boolean;
    items: {
        productId: string;
        quantity: number;
        unitCost?: number;
        notes?: string;
    }[];
}

export class BillOfMaterialService {
    static async create(data: BillOfMaterialInput) {
        const bomNumber = await generateDocumentNumber("BILL_OF_MATERIAL", "Bill of Material", "BOM-");

        return await prisma.$transaction(async (tx) => {
            const result = await tx.billOfMaterial.create({
                data: {
                    bomNumber,
                    name: data.name,
                    description: data.description,
                    productId: data.productId,
                    quantity: data.quantity,
                    isActive: data.isActive,
                    items: {
                        create: data.items.map((item) => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            unitCost: item.unitCost,
                            notes: item.notes,
                        })),
                    },
                },
                include: {
                    items: true,
                },
            });

            return result;
        });
    }

    static async update(id: string, data: BillOfMaterialInput) {
        return await prisma.$transaction(async (tx) => {
            // Delete existing items
            await tx.billOfMaterialItem.deleteMany({
                where: { billOfMaterialId: id },
            });

            // Update BOM and recreate items
            const result = await tx.billOfMaterial.update({
                where: { id },
                data: {
                    name: data.name,
                    description: data.description,
                    productId: data.productId,
                    quantity: data.quantity,
                    isActive: data.isActive,
                    items: {
                        create: data.items.map((item) => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            unitCost: item.unitCost,
                            notes: item.notes,
                        })),
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
        // Delete cascading items and BOM
        return await prisma.billOfMaterial.delete({
            where: { id },
        });
    }
}
