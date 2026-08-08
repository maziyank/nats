"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/permissions/utils";
import { SuperJSON } from "@/lib/superjson";
import type { ActionResponse } from "@/types/actions";
import { POSTransactionService } from "@/modules/pos/services/pos-transaction.service";
import { POSSessionService } from "@/modules/pos/services/pos-session.service";
import { HeldOrderService } from "@/modules/pos/services/held-order.service";
import { POSCartItem } from "./types";
import { z } from "zod";
import {
  requiredIdSchema,
  nonNegativeDecimalSchema,
} from "@/lib/validation/schemas";

// --- POS validation schemas ---
const posTransactionItemSchema = z.object({
  productId: requiredIdSchema,
  quantity: z.number().positive("Quantity must be greater than 0"),
  price: nonNegativeDecimalSchema,
  discount: nonNegativeDecimalSchema,
});

const processPOSTransactionSchema = z.object({
  sessionId: requiredIdSchema,
  items: z.array(posTransactionItemSchema).min(1, "At least 1 item required"),
  paymentMethod: z.enum(["CASH", "CARD", "QRIS"]),
  amountPaid: nonNegativeDecimalSchema,
  globalDiscount: nonNegativeDecimalSchema.default(0),
  customerId: z.string().cuid().optional(),
});

const openPOSSessionSchema = z.object({
  openingCash: nonNegativeDecimalSchema,
  warehouseId: requiredIdSchema,
  departmentId: z.string().cuid().optional().nullable(),
});

const closePOSSessionSchema = z.object({
  sessionId: requiredIdSchema,
  actualCash: nonNegativeDecimalSchema,
  notes: z.string().optional(),
});

const posCartItemSchema = z
  .object({
    id: requiredIdSchema,
    quantity: z.number().positive("Quantity must be greater than 0"),
    price: nonNegativeDecimalSchema,
    discount: nonNegativeDecimalSchema,
  })
  .passthrough();

const holdOrderSchema = z.object({
  cart: z.array(posCartItemSchema).min(1, "At least 1 item required"),
  totalAmount: nonNegativeDecimalSchema,
  note: z.string().optional(),
  customerId: z.string().cuid().optional(),
  customerName: z.string().optional(),
  globalDiscount: nonNegativeDecimalSchema.default(0),
});

export async function getPOSSessions(page: number = 1, limit: number = 50) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "pos.access")) {
    return SuperJSON.serialize([]);
  }

  const take = Math.min(Math.max(limit, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;

  const sessions = await prisma.pOSSession.findMany({
    orderBy: { startTime: "desc" },
    skip,
    take,
    include: {
      warehouse: {
        select: {
          name: true,
        },
      },
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      _count: {
        select: {
          salesOrders: true,
        },
      },
    },
  });

  const cashierIds = [...new Set(sessions.map((s) => s.cashierId))];
  const cashiers = cashierIds.length
    ? await prisma.user.findMany({
        where: { id: { in: cashierIds } },
        select: { id: true, name: true },
      })
    : [];
  const cashierById = new Map(cashiers.map((c) => [c.id, { name: c.name }]));

  const sessionsWithCashier = sessions.map((s) => ({
    ...s,
    cashier: cashierById.get(s.cashierId) ?? null,
  }));

  return SuperJSON.serialize(sessionsWithCashier);
}

export async function getPOSProducts(
  page: number = 1,
  pageSize: number = 20,
  query?: string,
  categoryId?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "pos.access")) {
    return SuperJSON.serialize({
      items: [],
      total: 0,
      hasMore: false,
    });
  }

  const q = query?.trim() ?? "";
  // Exact SKU / barcode fast path: equality hits unique index before ILIKE scan.
  const looksLikeSku =
    q.length > 0 &&
    q.length <= 64 &&
    !/\s/.test(q) &&
    page === 1 &&
    !categoryId;

  // Resolve the active POS session's warehouse so stock reflects only that location.
  const activePosSession = await prisma.pOSSession.findFirst({
    where: {
      status: "OPEN",
      cashierId: session.userId,
    },
    select: { warehouseId: true },
  });

  const where: {
    isActive: boolean;
    categoryId?: string;
    OR?: Array<Record<string, unknown>>;
    sku?: { equals: string; mode: "insensitive" };
  } = {
    isActive: true,
  };

  if (categoryId && categoryId !== "all") {
    where.categoryId = categoryId;
  }

  if (looksLikeSku) {
    // Prefer exact SKU match (unique index) for scanner / barcode entry.
    where.OR = [
      { sku: { equals: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
    ];
  } else if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
    ];
  }

  const now = new Date();

  const inventoryWhere = activePosSession?.warehouseId
    ? { warehouseId: activePosSession.warehouseId }
    : undefined;

  const productSelect = {
    id: true,
    name: true,
    sku: true,
    price: true,
    image: true,
    categoryId: true,
    category: { select: { id: true, name: true } },
    inventory: {
      where: inventoryWhere,
      select: { quantity: true },
    },
    discounts: {
      where: {
        isActive: true,
        startDate: { lte: now },
        OR: [{ endDate: null as Date | null }, { endDate: { gte: now } }],
      },
      select: {
        code: true,
        type: true,
        value: true,
      },
    },
  };

  // Exact SKU hit: return that product first without a full ILIKE scan when possible.
  if (looksLikeSku) {
    const exact = await prisma.product.findFirst({
      where: {
        isActive: true,
        sku: { equals: q, mode: "insensitive" },
      },
      select: productSelect,
    });
    if (exact) {
      const totalStock = exact.inventory.reduce(
        (acc, inv) => acc + inv.quantity,
        0,
      );
      return SuperJSON.serialize({
        items: [
          {
            id: exact.id,
            name: exact.name,
            sku: exact.sku,
            price: exact.price.toNumber(),
            image: exact.image,
            categoryId: exact.categoryId,
            categoryName: exact.category?.name || null,
            stock: totalStock,
            availableDiscounts: exact.discounts.map((d) => ({
              code: d.code,
              type: d.type,
              value: d.value.toNumber(),
            })),
          },
        ],
        total: 1,
        hasMore: false,
      });
    }
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: productSelect,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  const mapped = products.map((p) => {
    const totalStock = p.inventory.reduce((acc, inv) => acc + inv.quantity, 0);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.price.toNumber(),
      image: p.image,
      categoryId: p.categoryId,
      categoryName: p.category?.name || null,
      stock: totalStock,
      availableDiscounts: p.discounts.map((d) => ({
        code: d.code,
        type: d.type,
        value: d.value.toNumber(),
      })),
    };
  });

  return SuperJSON.serialize({
    items: mapped,
    total,
    hasMore: page * pageSize < total,
  });
}

export async function getPOSCategories() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "pos.access")) {
    return SuperJSON.serialize([]);
  }

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
  });
  return SuperJSON.serialize(categories);
}

export async function getWarehouses() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "pos.access")) {
    return SuperJSON.serialize([]);
  }

  const warehouses = await prisma.warehouse.findMany({
    orderBy: { name: "asc" },
  });
  return SuperJSON.serialize(warehouses);
}

/**
 * Returns the list of active Department tags that can be assigned to a POS
 * session. Mirrors the existing `getDepartments` action from the general
 * module but scoped to the `pos.access` permission so the POS UI can fetch
 * both warehouses and departments in one place.
 */
export async function getPOSDepartments() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "pos.access")) {
    return SuperJSON.serialize([]);
  }

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
  return SuperJSON.serialize(departments);
}

export async function getOpenPOSSession() {
  const session = await getSession();
  const userId = session?.userId;

  if (!userId || !hasPermission(session.permissions, "pos.access")) return null;

  const posSession = await prisma.pOSSession.findFirst({
    where: {
      status: "OPEN",
      cashierId: userId,
    },
    include: {
      warehouse: true,
      department: {
        select: { id: true, name: true, code: true },
      },
    },
  });

  if (!posSession) return null;

  const cashier = await prisma.user.findUnique({
    where: { id: posSession.cashierId },
    select: { name: true },
  });

  return SuperJSON.serialize({
    ...posSession,
    cashier,
  });
}

export async function openPOSSession(
  openingCash: number,
  warehouseId: string,
  departmentId?: string | null,
) {
  const session = await getSession();
  const userId = session?.userId;
  if (!userId || !hasPermission(session.permissions, "pos.access"))
    throw new Error("Unauthorized");

  const parsed = openPOSSessionSchema.parse({
    openingCash,
    warehouseId,
    departmentId,
  });

  const newSession = await POSSessionService.open(
    userId,
    parsed.openingCash,
    parsed.warehouseId,
    parsed.departmentId,
  );

  revalidatePath("/pos");
  return SuperJSON.serialize(newSession);
}

export async function closePOSSession(
  sessionId: string,
  actualCash: number,
  notes?: string,
) {
  const sessionUser = await getSession();
  if (!sessionUser || !hasPermission(sessionUser.permissions, "pos.access")) {
    throw new Error("Unauthorized");
  }

  const parsed = closePOSSessionSchema.parse({
    sessionId,
    actualCash,
    notes,
  });

  await POSSessionService.close(
    parsed.sessionId,
    parsed.actualCash,
    parsed.notes,
  );

  revalidatePath("/pos");
}

export async function getPOSSessionTransactions(
  sessionId: string,
  page: number = 1,
  limit: number = 100,
) {
  const take = Math.min(Math.max(limit, 1), 200);
  const skip = (Math.max(page, 1) - 1) * take;

  const transactions = await prisma.salesInvoice.findMany({
    where: { posSessionId: sessionId },
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      invoiceNumber: true,
      createdAt: true,
      totalAmount: true,
      contact: {
        select: {
          name: true,
        },
      },
      items: {
        select: {
          quantity: true,
        },
      },
      posSession: {
        select: {
          id: true,
          cashierId: true,
        },
      },
    },
  });

  const cashierIds = [
    ...new Set(
      transactions
        .map((t) => t.posSession?.cashierId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const cashiers = cashierIds.length
    ? await prisma.user.findMany({
        where: { id: { in: cashierIds } },
        select: { id: true, name: true },
      })
    : [];
  const cashierById = new Map(cashiers.map((c) => [c.id, { name: c.name }]));

  const transactionsWithCashier = transactions.map((t) => ({
    ...t,
    posSession: t.posSession
      ? {
          ...t.posSession,
          cashier: cashierById.get(t.posSession.cashierId) ?? null,
        }
      : null,
  }));

  return SuperJSON.serialize(transactionsWithCashier);
}

export async function processPOSTransaction(
  sessionId: string,
  items: {
    productId: string;
    quantity: number;
    price: number;
    discount: number;
  }[],
  paymentMethod: "CASH" | "CARD" | "QRIS",
  amountPaid: number,
  globalDiscount: number = 0,
  customerId?: string,
): Promise<
  ActionResponse<{
    invoiceId: string;
    outbox: {
      outboxIds: string[];
      alreadyQueuedIds: string[];
      processed: boolean;
    };
  }>
> {
  const validation = processPOSTransactionSchema.safeParse({
    sessionId,
    items,
    paymentMethod,
    amountPaid,
    globalDiscount,
    customerId,
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const parsed = validation.data;

  try {
    const result = await POSTransactionService.process(
      parsed.sessionId,
      parsed.items,
      parsed.paymentMethod,
      parsed.amountPaid,
      parsed.globalDiscount,
      parsed.customerId,
    );

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to process POS transaction",
    };
  }
}

export async function holdOrder(
  cart: POSCartItem[],
  totalAmount: number,
  note?: string,
  customerId?: string,
  customerName?: string,
  globalDiscount: number = 0,
) {
  const session = await getSession();
  const userId = session?.userId;
  if (!userId) throw new Error("Unauthorized");

  const parsed = holdOrderSchema.parse({
    cart,
    totalAmount,
    note,
    customerId,
    customerName,
    globalDiscount,
  });

  const heldOrder = await HeldOrderService.hold(
    userId,
    parsed.cart,
    parsed.totalAmount,
    parsed.note,
    parsed.customerId,
    parsed.customerName,
    parsed.globalDiscount,
  );

  revalidatePath("/pos");
  return SuperJSON.serialize(heldOrder);
}

export async function validateDiscountCode(code: string) {
  const discount = await prisma.discount.findUnique({
    where: { code, isActive: true },
    include: {
      products: {
        select: { id: true },
      },
    },
  });

  if (!discount) {
    throw new Error("Invalid discount code");
  }

  const now = new Date();
  if (
    discount.startDate > now ||
    (discount.endDate && discount.endDate < now)
  ) {
    throw new Error("Discount code is expired or not yet active");
  }

  return SuperJSON.serialize(discount);
}

export async function getHeldOrders() {
  const session = await getSession();
  if (!session?.userId) throw new Error("Unauthorized");

  await HeldOrderService.cleanupExpired();

  // Scope to the current cashier's open session when available.
  const openSession = await prisma.pOSSession.findFirst({
    where: { status: "OPEN", cashierId: session.userId },
    select: { id: true },
  });

  const heldOrders = await prisma.heldOrder.findMany({
    where: openSession
      ? {
          OR: [
            { posSessionId: openSession.id },
            { userId: session.userId, posSessionId: null },
          ],
        }
      : { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: {
        select: { id: true, name: true },
      },
    },
  });

  return SuperJSON.serialize(heldOrders);
}

export async function getPOSInvoice(id: string) {
  const session = await getSession();
  if (!session?.userId) throw new Error("Unauthorized");

  const invoice = await prisma.salesInvoice.findUnique({
    where: { id },
    include: {
      contact: true,
      items: {
        include: {
          product: true,
        },
      },
      payments: {
        include: {
          cashAccount: true,
        },
      },
      salesOrder: true,
      posSession: true,
    },
  });

  if (!invoice) return null;

  return SuperJSON.serialize(invoice);
}

export async function resumeOrder(heldOrderId: string) {
  const session = await getSession();
  if (!session?.userId) throw new Error("Unauthorized");

  requiredIdSchema.parse(heldOrderId);

  const heldOrder = await HeldOrderService.resume(heldOrderId);

  revalidatePath("/pos");
  return SuperJSON.serialize(heldOrder);
}

export async function deleteHeldOrder(heldOrderId: string) {
  const session = await getSession();
  if (!session?.userId) throw new Error("Unauthorized");

  requiredIdSchema.parse(heldOrderId);

  await HeldOrderService.delete(heldOrderId);

  revalidatePath("/pos");
}
