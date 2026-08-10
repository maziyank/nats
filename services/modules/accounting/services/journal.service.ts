import { prisma } from "@/services/lib/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { EntryStatus } from "@/prisma/generated/prisma/enums";
import { Decimal } from "decimal.js";
import { enqueueIntegrationEvent } from "@/services/modules/integration/outbox";
import { getPaginationMetadata } from "@/services/lib/pagination";
import {
  createJournalEntrySchema,
  requiredIdSchema,
} from "@/services/lib/validation/schemas";
import { z } from "zod";
import { generateDocumentNumber } from "@/services/lib/document-numbering";

type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;

export class JournalService {
  /**
   * Get journal entries with pagination and filtering
   */
  static async getJournalEntries({
    page = 1,
    pageSize = 20,
    startDate,
    endDate,
    status,
    search,
  }: {
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    search?: string;
  }) {
    const where: Prisma.JournalEntryWhereInput = {};
    if (status && status !== "all") {
      where.status = status as unknown as EntryStatus;
    }
    if (startDate) {
      where.transactionDate = {
        ...((where.transactionDate as unknown as Prisma.DateTimeFilter) || {}),
        gte: new Date(startDate),
      };
    }
    if (endDate) {
      where.transactionDate = {
        ...((where.transactionDate as unknown as Prisma.DateTimeFilter) || {}),
        lte: new Date(endDate),
      };
    }
    if (search) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { entryNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        orderBy: { postedAt: "desc" },
        // List needs header + debit totals only; full lines load on detail page.
        select: {
          id: true,
          entryNumber: true,
          transactionDate: true,
          description: true,
          status: true,
          postedAt: true,
          user: {
            select: { name: true, email: true },
          },
          lines: {
            select: {
              debitAmount: true,
            },
          },
        },
        skip,
        take: pageSize,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return {
      items: entries,
      pagination: getPaginationMetadata(total, page, pageSize),
    };
  }

  /**
   * Get a single journal entry by ID
   */
  static async getJournalEntry(id: string) {
    return prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            account: { select: { name: true, code: true } },
            contact: { select: { name: true } },
            department: { select: { name: true } },
            project: { select: { name: true } },
          },
          orderBy: [
            { debitAmount: "desc" },
            { creditAmount: "desc" }
          ],
        },
        user: {
          select: { name: true, email: true },
        },
        attachments: true,
      },
    });
  }

  /**
   * Create a new journal entry
   */
  /**
   * Create a new journal entry
   */
  static async createJournalEntry(
    data: CreateJournalEntryInput,
    userId: string,
    tx?: Prisma.TransactionClient,
  ) {
    data = createJournalEntrySchema.parse(data);

    // Validate debit = credit using Decimal for precision
    const totalDebit = data.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line?.debitAmount || 0)),
      new Decimal(0),
    );
    const totalCredit = data.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line?.creditAmount || 0)),
      new Decimal(0),
    );

    if (!totalDebit.equals(totalCredit)) {
      throw new Error(
        `Debits must equal credits. Debit: ${totalDebit}, Credit: ${totalCredit}`,
      );
    }

    const executeCreate = async (db: Prisma.TransactionClient) => {
      let entryNumber = data.entryNumber;

      if (!entryNumber) {
        entryNumber = await generateDocumentNumber(
          "JOURNAL_ENTRY",
          "Journal Entry",
          "JE",
        );
      }

      const entry = await db.journalEntry.create({
        data: {
          userId,
          entryNumber,
          transactionDate: data.transactionDate || new Date(),
          description: data.description || "",
          notes: data.notes,
          status: "draft",
          lines: {
            create: data.lines.map((line, index) => ({
              accountId: line.accountId,
              debitAmount: line.debitAmount,
              creditAmount: line.creditAmount,
              description: line.description,
              contactId: line.contactId,
              departmentId: line.departmentId,
              projectId: line.projectId,
              lineNumber: index + 1,
            })),
          },
          attachments: data.attachments?.length
            ? {
                connect: data.attachments.map((a) => ({ id: a.id })),
              }
            : undefined,
        },
      });

      // Emit Outbox event
      await enqueueIntegrationEvent(db, {
        topic: "ACCOUNTING",
        type: "JOURNAL_ENTRY_CREATED",
        aggregateType: "JOURNAL_ENTRY",
        aggregateId: entry.id,
        payload: {
          journalEntryId: entry.id,
          entryNumber: entry.entryNumber,
          transactionDate: entry.transactionDate.toISOString(),
          description: entry.description || "",
          totalAmount: totalDebit.toFixed(2),
          userId,
        },
      });

      return entry;
    };

    if (tx) {
      return executeCreate(tx);
    } else {
      return prisma.$transaction(executeCreate);
    }
  }

  /**
   * Update a journal entry
   */
  static async updateJournalEntry(id: string, data: CreateJournalEntryInput) {
    requiredIdSchema.parse(id);
    data = createJournalEntrySchema.parse(data);

    const existingEntry = await prisma.journalEntry.findUnique({
      where: { id },
    });

    if (!existingEntry) {
      throw new Error("Journal entry not found");
    }

    if (existingEntry.status === "posted") {
      throw new Error("Cannot edit posted journal entries");
    }

    // Validate debit = credit using Decimal for precision
    const totalDebit = data.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line?.debitAmount || 0)),
      new Decimal(0),
    );
    const totalCredit = data.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line?.creditAmount || 0)),
      new Decimal(0),
    );

    if (!totalDebit.equals(totalCredit)) {
      throw new Error(
        `Debits must equal credits. Debit: ${totalDebit}, Credit: ${totalCredit}`,
      );
    }

    return prisma.$transaction(async (tx) => {
      // Delete existing lines
      await tx.journalEntryLine.deleteMany({
        where: { journalEntryId: id },
      });

      // Update entry and create new lines
      const updatedEntry = await tx.journalEntry.update({
        where: { id },
        data: {
          transactionDate: data.transactionDate,
          description: data.description || "",
          lines: {
            create: data.lines.map((line, index) => ({
              accountId: line.accountId,
              debitAmount: line.debitAmount,
              creditAmount: line.creditAmount,
              description: line.description,
              contactId: line.contactId,
              departmentId: line.departmentId,
              projectId: line.projectId,
              lineNumber: index + 1,
            })),
          },
          attachments: {
            set: data.attachments?.map((a) => ({ id: a.id })) || [],
          },
        },
      });

      return updatedEntry;
    });
  }

  /**
   * Delete a journal entry
   */
  static async deleteJournalEntry(id: string) {
    const existingEntry = await prisma.journalEntry.findUnique({
      where: { id },
    });

    if (!existingEntry) {
      throw new Error("Journal entry not found");
    }

    if (existingEntry.status === "posted") {
      throw new Error("Cannot delete posted journal entries");
    }

    await prisma.$transaction(async (tx) => {
      await tx.journalEntryLine.deleteMany({
        where: { journalEntryId: id },
      });

      await tx.journalEntry.delete({
        where: { id },
      });
    });
  }

  /**
   * Post a journal entry.
   *
   * Only the `JournalEntry.status` is flipped to `posted` and a
   * `JOURNAL_ENTRY_POSTED` outbox event is enqueued. The per-account
   * running balance is recomputed asynchronously by the
   * `JOURNAL_ENTRY_POSTED` consumer in the integration worker, so this
   * call returns quickly even when many accounts are affected.
   */
  static async postJournalEntry(id: string, tx?: Prisma.TransactionClient) {
    const executePost = async (db: Prisma.TransactionClient) => {
      const existingEntry = await db.journalEntry.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          entryNumber: true,
          userId: true,
        },
      });

      if (!existingEntry) {
        throw new Error("Journal entry not found");
      }

      if (existingEntry.status === "posted") {
        return;
      }

      // 1. Mark entry as posted
      await db.journalEntry.update({
        where: { id },
        data: {
          status: "posted",
          postedAt: new Date(),
        },
      });

      // 2. Emit Outbox event for async consumers (running balance
      //    calculation, projections, exports, etc.).
      await enqueueIntegrationEvent(db, {
        topic: "ACCOUNTING",
        type: "JOURNAL_ENTRY_POSTED",
        aggregateType: "JOURNAL_ENTRY",
        aggregateId: existingEntry.id,
        payload: {
          journalEntryId: existingEntry.id,
          entryNumber: existingEntry.entryNumber,
          userId: existingEntry.userId,
        },
      });
    };

    if (tx) {
      return executePost(tx);
    } else {
      return prisma.$transaction(executePost);
    }
  }
}
