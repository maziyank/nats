import { prisma } from "@/services/lib/prisma";
import { ReportContext } from "@/services/lib/reporting/types";

export interface JournalEntryReportData {
  entry: any;
}

export async function getJournalEntryData(input: { entryId: string }): Promise<JournalEntryReportData> {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: input.entryId },
    include: {
      lines: {
        include: {
          account: true,
          contact: true,
        },
        orderBy: { lineNumber: "asc" },
      },
      user: {
        select: { name: true, email: true },
      },
    },
  });

  if (!entry) {
    throw new Error(`Journal Entry with ID ${input.entryId} not found`);
  }

  return { entry };
}
