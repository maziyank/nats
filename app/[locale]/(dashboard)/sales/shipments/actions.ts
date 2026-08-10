"use server";

import { z } from "zod";
import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { SalesShipmentInput } from "./types";
import { getSalesOrder } from "../orders/actions";
import { SuperJSON } from "@/services/lib/superjson";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { Decimal } from "decimal.js";
import { resolveUserNames, userNameRef } from "@/services/lib/status-tracking";

const decimalSchema = z.union([z.number(), z.string()]).transform((val) => Number(val));
const nonNegativeDecimalSchema = decimalSchema.refine((val) => val >= 0, "Must be non-negative");
const requiredIdSchema = z.string().cuid();
const dateSchema = z.coerce.date();

const salesShipmentItemSchema = z.object({
  productId: requiredIdSchema,
  quantity: decimalSchema.refine((val) => val > 0, "Quantity must be greater than 0"),
  salesOrderItemId: z.string().optional(),
});

const salesShipmentSchema = z.object({
  contactId: requiredIdSchema,
  salesOrderId: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  shipmentDate: dateSchema,
  notes: z.string().optional(),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
  items: z.array(salesShipmentItemSchema).min(1, "At least 1 item required"),
  attachmentIds: z.array(z.string()).optional(),
});

const salesShipmentUpdateSchema = salesShipmentSchema.extend({
  status: z.enum(["DRAFT", "COMPLETED", "CANCELLED"]).optional(),
});

export { getSalesOrder };

export async function getSalesShipments(
  page: number = 1,
  limit: number = 10,
  search?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return {
      shipments: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.SalesShipmentWhereInput = {
    AND: [],
  };

  if (search) {
    (where.AND as Prisma.SalesShipmentWhereInput[]).push({
      OR: [
        { shipmentNumber: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
        {
          salesOrder: {
            orderNumber: { contains: search, mode: "insensitive" },
          },
        },
      ],
    });
  }

  const [shipments, total] = await Promise.all([
    prisma.salesShipment.findMany({
      where,
      select: {
        id: true,
        shipmentNumber: true,
        shipmentDate: true,
        status: true,
        contactId: true,
        salesOrderId: true,
        contact: {
          select: { id: true, name: true },
        },
        salesOrder: {
          select: { id: true, orderNumber: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.salesShipment.count({ where }),
  ]);

  return {
    shipments: SuperJSON.serialize(shipments),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getSalesShipment(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return null;
  }

  const shipment = await prisma.salesShipment.findUnique({
    where: { id },
    include: {
      contact: true,
      salesOrder: true,
      items: {
        include: {
          product: true,
        },
      },
      department: true,
      project: true,
      attachments: true,
    },
  });

  if (!shipment) return null;

  const nameById = await resolveUserNames([
    shipment.createdById,
    shipment.updatedById,
    shipment.completedById,
    shipment.cancelledById,
  ]);

  return SuperJSON.serialize({
    ...shipment,
    createdBy: userNameRef(shipment.createdById, nameById),
    updatedBy: userNameRef(shipment.updatedById, nameById),
    completedBy: userNameRef(shipment.completedById, nameById),
    cancelledBy: userNameRef(shipment.cancelledById, nameById),
  });
}

export async function getProducts() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return [];
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      baseUnit: {
        select: {
          symbol: true,
        },
      },
      salesUnit: {
        select: {
          symbol: true,
        },
      },
    },
  });
  return SuperJSON.serialize(products);
}

export async function getSalesOrdersForSelect() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return [];
  }

  const orders = await prisma.salesOrder.findMany({
    where: {
      status: { in: ["CONFIRMED", "PARTIALLY_SHIPPED"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
      items: true,
    },
  });
  return SuperJSON.serialize(orders);
}

import { SalesShipmentService } from "@/services/modules/sales/services/sales-shipment.service";

import { InventoryService } from "@/services/modules/inventory/services/inventory.service";
import { getRequiredDefaultAccount } from "@/services/lib/accounting/default-account.service";

export const createSalesShipment = authorizedAction(
  "sales.create",
  async (data: SalesShipmentInput) => {
    try {
      const parseResult = salesShipmentSchema.safeParse(data);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.issues[0]?.message ?? "Invalid input" };
      }
      data = parseResult.data;
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await SalesShipmentService.create(data, session.userId);

      revalidatePath("/sales/shipments");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to create Shipment:", error);
      const message = error instanceof Error ? error.message : "Failed to create Sales Shipment";
      return { success: false, error: message };
    }
  },
);

export const updateSalesShipment = authorizedAction(
  "sales.edit",
  async (
    id: string,
    data: SalesShipmentInput & {
      status?: "DRAFT" | "COMPLETED" | "CANCELLED";
    },
  ) => {
    try {
      const idResult = requiredIdSchema.safeParse(id);
      if (!idResult.success) return { success: false, error: "Invalid shipment id" };
      const parseResult = salesShipmentUpdateSchema.safeParse(data);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.issues[0]?.message ?? "Invalid input" };
      }
      data = parseResult.data;
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const currentShipment = await prisma.salesShipment.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!currentShipment) throw new Error("Shipment not found");

      const previousStatus = currentShipment.status;
      if (previousStatus === "COMPLETED") {
        return { success: false, error: "Cannot edit completed shipment" };
      }

      const nextStatus = data.status || previousStatus;
      const statusTracking: {
        updatedById: string;
        completedAt?: Date;
        completedById?: string;
        cancelledAt?: Date;
        cancelledById?: string;
      } = {
        updatedById: session.userId,
      };

      // previousStatus is DRAFT | CANCELLED after the guard above
      if (nextStatus === "COMPLETED") {
        statusTracking.completedAt = new Date();
        statusTracking.completedById = session.userId;
      }

      if (nextStatus === "CANCELLED" && previousStatus !== "CANCELLED") {
        statusTracking.cancelledAt = new Date();
        statusTracking.cancelledById = session.userId;
      }

      const result = await prisma.$transaction(async (tx) => {
        // Delete existing items
        await tx.salesShipmentItem.deleteMany({
          where: { salesShipmentId: id },
        });

        // Update Shipment and create new items
        const updatedShipment = await tx.salesShipment.update({
          where: { id },
          data: {
            contactId: data.contactId,
            salesOrderId: data.salesOrderId,
            departmentId: data.departmentId,
            projectId: data.projectId,
            shipmentDate: data.shipmentDate,
            notes: data.notes,
            trackingNumber: data.trackingNumber,
            carrier: data.carrier,
            status: nextStatus,
            ...statusTracking,
            items: {
              create: data.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                salesOrderItemId: item.salesOrderItemId,
              })),
            },
            attachments: data.attachmentIds
              ? {
                set: data.attachmentIds.map((id) => ({ id })),
              }
              : undefined,
          },
          include: {
            items: true,
          },
        });

        // If status changed to COMPLETED, update SO items and Inventory
        if (
          data.status === "COMPLETED" &&
          currentShipment.status !== "COMPLETED"
        ) {
          for (const item of data.items) {
            if (item.salesOrderItemId) {
              await tx.salesOrderItem.update({
                where: { id: item.salesOrderItemId },
                data: {
                  shippedQuantity: {
                    increment: item.quantity,
                  },
                },
              });
            }
          }

          // Check SO status
          if (data.salesOrderId) {
            const so = await tx.salesOrder.findUnique({
              where: { id: data.salesOrderId },
              include: { items: true },
            });

            if (so) {
              const allShipped = so.items.every(
                (item) => item.shippedQuantity >= item.quantity,
              );
              const anyShipped = so.items.some(
                (item) => item.shippedQuantity > 0,
              );

              let newStatus = so.status;
              if (allShipped) {
                newStatus = "SHIPPED";
              } else if (anyShipped) {
                newStatus = "PARTIALLY_SHIPPED";
              }

              if (newStatus !== so.status) {
                await tx.salesOrder.update({
                  where: { id: so.id },
                  data: { status: newStatus },
                });
              }
            }
          }

          // Create InventoryMovement (OUT)
          const movementItems = [];
          let totalCogs = 0;

          for (const item of data.items) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            const unitCost = product ? Number(product.averageCost) : 0;

            movementItems.push({
              productId: item.productId,
              quantity: item.quantity,
              notes: "Sales Shipment",
              unitCost
            });

            totalCogs += item.quantity * unitCost;
          }

          await InventoryService.createInventoryMovement(tx, {
            type: "OUT",
            reference: currentShipment.shipmentNumber,
            notes: data.notes || "Sales Shipment Completed",
            items: movementItems,
            transactionDate: data.shipmentDate
          });

          // Create Journal Entry for COGS
          if (totalCogs > 0) {
            const session = await getSession();
            if (!session) throw new Error("Unauthorized");

            const cogsAccount = await getRequiredDefaultAccount("COGS");
            const inventoryAccount = await getRequiredDefaultAccount("INVENTORY_ASSET");

            const je = await JournalService.createJournalEntry({
              entryNumber: `JE-${updatedShipment.shipmentNumber}`,
              transactionDate: data.shipmentDate,
              description: `Cost of Goods Sold for Shipment #${updatedShipment.shipmentNumber}`,
              lines: [
                {
                  accountId: cogsAccount.accountId,
                  debitAmount: new Decimal(totalCogs).toNumber(),
                  creditAmount: 0,
                  description: "Cost of Goods Sold",
                  departmentId: data.departmentId,
                  projectId: data.projectId,
                },
                {
                  accountId: inventoryAccount.accountId,
                  debitAmount: 0,
                  creditAmount: new Decimal(totalCogs).toNumber(),
                  description: "Inventory Asset",
                  departmentId: data.departmentId,
                  projectId: data.projectId,
                },
              ],
            }, session.userId, tx);

            await JournalService.postJournalEntry(je.id, tx);
          }
        }

        return updatedShipment;
      });

      revalidatePath("/sales/shipments");
      revalidatePath("/sales/orders");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to update Shipment:", error);
      return { success: false, error: "Failed to update Sales Shipment" };
    }
  },
);

export const deleteSalesShipment = authorizedAction(
  "sales.delete",
  async (id: string) => {
    try {
      const idResult = requiredIdSchema.safeParse(id);
      if (!idResult.success) return { success: false, error: "Invalid shipment id" };
      const currentShipment = await prisma.salesShipment.findUnique({
        where: { id },
      });

      if (!currentShipment) throw new Error("Shipment not found");

      if (currentShipment.status === "COMPLETED") {
        return { success: false, error: "Cannot delete completed shipment" };
      }

      await prisma.salesShipment.delete({
        where: { id },
      });

      revalidatePath("/sales/shipments");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete Shipment:", error);
      return { success: false, error: "Failed to delete Sales Shipment" };
    }
  },
);
