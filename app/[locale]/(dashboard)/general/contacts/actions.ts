"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/services/lib/prisma";
import {
  CreateContactInput,
  UpdateContactInput,
  PaginatedResult,
  Contact,
} from "../types";
import { Prisma, ContactType } from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { SuperJSON } from "@/services/lib/superjson";
import { getTranslations } from "next-intl/server";

export async function getContact(id: string) {
  const contact = await prisma.contact.findUnique({
    where: { id },
  });
  return contact;
}

export async function getContactCashTransactions({
  contactId,
  page = 1,
  pageSize = 10,
}: {
  contactId: string;
  page?: number;
  pageSize?: number;
}) {
  const skip = (page - 1) * pageSize;
  const where: Prisma.CashTransactionWhereInput = {
    contactId,
  };

  const [data, total] = await Promise.all([
    prisma.cashTransaction.findMany({
      where,
      include: {
        cashAccount: true,
        allocations: {
          include: {
            account: true,
          },
        },
      },
      orderBy: { date: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.cashTransaction.count({ where }),
  ]);

  return {
    data: SuperJSON.serialize(data),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getContactPurchaseOrders({
  contactId,
  page = 1,
  pageSize = 10,
}: {
  contactId: string;
  page?: number;
  pageSize?: number;
}) {
  const skip = (page - 1) * pageSize;
  const where: Prisma.PurchaseOrderWhereInput = {
    contactId,
  };

  const [data, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return {
    data: SuperJSON.serialize(data),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getContactPurchaseInvoices({
  contactId,
  page = 1,
  pageSize = 10,
}: {
  contactId: string;
  page?: number;
  pageSize?: number;
}) {
  const skip = (page - 1) * pageSize;
  const where: Prisma.PurchaseInvoiceWhereInput = {
    contactId,
  };

  const [data, total] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where,
      orderBy: { invoiceDate: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.purchaseInvoice.count({ where }),
  ]);

  return {
    data: SuperJSON.serialize(data),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getContactPurchasePayments({
  contactId,
  page = 1,
  pageSize = 10,
}: {
  contactId: string;
  page?: number;
  pageSize?: number;
}) {
  const skip = (page - 1) * pageSize;
  const where: Prisma.PurchasePaymentWhereInput = {
    contactId,
  };

  const [data, total] = await Promise.all([
    prisma.purchasePayment.findMany({
      where,
      include: {
        purchaseInvoice: true,
        cashAccount: true,
      },
      orderBy: { paymentDate: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.purchasePayment.count({ where }),
  ]);

  return {
    data: SuperJSON.serialize(data),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getContactSalesOrders({
  contactId,
  page = 1,
  pageSize = 10,
}: {
  contactId: string;
  page?: number;
  pageSize?: number;
}) {
  const skip = (page - 1) * pageSize;
  const where: Prisma.SalesOrderWhereInput = {
    contactId,
  };

  const [data, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.salesOrder.count({ where }),
  ]);

  return {
    data: SuperJSON.serialize(data),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getContactSalesInvoices({
  contactId,
  page = 1,
  pageSize = 10,
}: {
  contactId: string;
  page?: number;
  pageSize?: number;
}) {
  const skip = (page - 1) * pageSize;
  const where: Prisma.SalesInvoiceWhereInput = {
    contactId,
  };

  const [data, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      orderBy: { invoiceDate: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.salesInvoice.count({ where }),
  ]);

  return {
    data: SuperJSON.serialize(data),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getContactSalesPayments({
  contactId,
  page = 1,
  pageSize = 10,
}: {
  contactId: string;
  page?: number;
  pageSize?: number;
}) {
  const skip = (page - 1) * pageSize;
  const where: Prisma.SalesPaymentWhereInput = {
    contactId,
  };

  const [data, total] = await Promise.all([
    prisma.salesPayment.findMany({
      where,
      include: {
        salesInvoice: true,
        cashAccount: true,
      },
      orderBy: { paymentDate: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.salesPayment.count({ where }),
  ]);

  return {
    data: SuperJSON.serialize(data),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getContactJournalEntries({
  contactId,
  page = 1,
  pageSize = 10,
}: {
  contactId: string;
  page?: number;
  pageSize?: number;
}) {
  const skip = (page - 1) * pageSize;
  const where: Prisma.JournalEntryWhereInput = {
    lines: {
      some: {
        contactId,
      },
    },
  };

  const [data, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
      orderBy: { transactionDate: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.journalEntry.count({ where }),
  ]);

  return {
    data: SuperJSON.serialize(data),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Fetch contacts with pagination and search.
 *
 * @param page     - Page number (default: 1)
 * @param pageSize - Items per page (default: 10)
 * @param search   - Search term for name, email, or phone
 * @param type     - Optional filter by contact type
 * @returns        - Object containing contacts list and pagination metadata
 */
export async function getContacts({
  page = 1,
  pageSize = 20,
  search = "",
  type,
}: {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: ContactType;
} = {}): Promise<PaginatedResult<Contact>> {
  const skip = (page - 1) * pageSize;

  const where: Prisma.ContactWhereInput = {
    ...(type ? { type } : {}),
    ...(search
      ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export const createContact = authorizedAction(
  "contacts.create",
  async (data: CreateContactInput) => {
    try {
      const contact = await prisma.contact.create({
        data,
      });
      revalidatePath("/general/contacts");
      return { success: true, contact };
    } catch (error) {
      console.error("Failed to create contact:", error);
      const t = await getTranslations("General.Contacts");
      return { success: false, error: t("create_error") };
    }
  }
);

export const updateContact = authorizedAction(
  "contacts.edit",
  async (id: string, data: UpdateContactInput) => {
    try {
      const contact = await prisma.contact.update({
        where: { id },
        data,
      });
      revalidatePath("/general/contacts");
      return { success: true, contact };
    } catch (error) {
      console.error("Failed to update contact:", error);
      const t = await getTranslations("General.Contacts");
      return { success: false, error: t("update_error") };
    }
  }
);

export const deleteContact = authorizedAction(
  "contacts.delete",
  async (id: string) => {
    try {
      await prisma.contact.delete({
        where: { id },
      });
      revalidatePath("/general/contacts");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete contact:", error);
      const t = await getTranslations("General.Contacts");
      return { success: false, error: t("delete_error") };
    }
  }
);
