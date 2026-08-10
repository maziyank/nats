"use server";

import { prisma } from "@/services/lib/prisma";
import { SuperJSON } from "@/services/lib/superjson";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export async function getInventoryDashboardMetrics() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return {
      totalProducts: 0,
      totalValue: 0,
      lowStockItems: [],
      recentMovements: [],
    };
  }

  const [
    totalProducts,
    totalValueResult,
    lowStockItemsResult,
    recentMovements,
  ] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.$queryRaw`
      SELECT SUM(p.cost * i.quantity) as total_value
      FROM "Inventory" i
      JOIN "Product" p ON i."productId" = p.id
    `,
    prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Inventory" WHERE quantity <= "reorderPoint" LIMIT 5
      `,
    prisma.inventoryMovementDetail.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        product: true,
        inventoryMovement: {
          include: {
            fromWarehouse: true,
            toWarehouse: true,
          },
        },
      },
    }),
  ]);

  const totalValue =
    (totalValueResult as unknown as { total_value: number }[])[0]
      ?.total_value || 0;

  const lowStockIds = (lowStockItemsResult as { id: string }[]).map(
    (item) => item.id
  );

  const lowStockItems = await prisma.inventory.findMany({
    where: {
      id: {
        in: lowStockIds,
      },
    },
    include: {
      product: true,
      warehouse: true,
    },
  });

  return {
    totalProducts,
    totalValue: Number(totalValue),
    lowStockItems: SuperJSON.serialize(lowStockItems),
    recentMovements: SuperJSON.serialize(recentMovements),
  };
}
