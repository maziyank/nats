import { prisma } from "@/services/lib/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { formatSequence } from "@/services/lib/utils/format-sequence";

/**
 * Ensures a document numbering format exists for an entity type or creates the default.
 */
export async function getOrCreateDocumentNumbering(
  entityType: string,
  defaultName: string = entityType,
  defaultPrefix: string = "",
) {
  let docFormat = await prisma.documentNumbering.findUnique({
    where: { entityType },
  });

  if (!docFormat) {
    // Create if missing; handle concurrent uniqueness races.
    try {
      docFormat = await prisma.documentNumbering.create({
        data: {
          entityType,
          name: defaultName,
          prefix: defaultPrefix,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        docFormat = await prisma.documentNumbering.findUniqueOrThrow({
          where: { entityType },
        });
      } else {
        throw error;
      }
    }
  }

  return docFormat;
}

/**
 * Atomically generates the next formatted sequence number for the given entity type.
 */
export async function generateDocumentNumber(
  entityType: string,
  defaultName?: string,
  defaultPrefix?: string,
): Promise<string> {
  // Ensure the settings row exists before entering the locked transaction.
  await getOrCreateDocumentNumbering(
    entityType,
    defaultName ?? entityType,
    defaultPrefix ?? "",
  );

  const result = await prisma.$transaction(
    async (tx) => {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      // 1. Lock the DocumentNumbering row first with SELECT ... FOR UPDATE.
      //    Serializes concurrent generators and keeps lock order
      //    DocumentNumbering -> TenantTransactionMonthly to avoid deadlocks.
      const formatRows = await tx.$queryRaw<
        Array<{
          currentSequence: number;
          prefix: string;
          suffix: string;
          sequenceDigits: number;
          includeYear: boolean;
          yearFormat: string;
          includeMonth: boolean;
          resetYearly: boolean;
          resetMonthly: boolean;
          lastGeneratedAt: Date | null;
        }>
      >`
            SELECT
                "currentSequence", "prefix", "suffix", "sequenceDigits",
                "includeYear", "yearFormat", "includeMonth",
                "resetYearly", "resetMonthly", "lastGeneratedAt"
            FROM "DocumentNumbering"
            WHERE "entityType" = ${entityType}
            FOR UPDATE
        `;
      const format = formatRows[0];
      if (!format) {
        throw new Error(
          `Document numbering format not found for entity type: ${entityType}`,
        );
      }

      // 2. Atomically increment the monthly counter.
      await tx.tenantTransactionMonthly.upsert({
        where: { yearMonth },
        create: { yearMonth, count: 1 },
        update: { count: { increment: 1 } },
      });

      let isYearReset = false;
      let isMonthReset = false;

      if (format.lastGeneratedAt) {
        if (
          format.resetYearly &&
          format.lastGeneratedAt.getFullYear() !== now.getFullYear()
        ) {
          isYearReset = true;
        }
        if (
          format.resetMonthly &&
          format.lastGeneratedAt.getMonth() !== now.getMonth()
        ) {
          isMonthReset = true;
        }
      }

      const newSequence =
        isYearReset || isMonthReset ? 1 : format.currentSequence + 1;

      // 3. Row is already locked; plain update is safe.
      await tx.documentNumbering.update({
        where: { entityType },
        data: {
          currentSequence: newSequence,
          lastGeneratedAt: now,
        },
      });

      // 4. Format the result string
      return formatSequence(
        newSequence,
        format.prefix,
        format.suffix,
        format.sequenceDigits,
        format.includeYear,
        format.yearFormat,
        format.includeMonth,
        now,
      );
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5000,
      timeout: 10000,
    },
  );

  return result;
}
