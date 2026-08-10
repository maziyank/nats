import { Prisma } from "@/prisma/generated/prisma/client";
import { PaginatedResult } from "@/services/lib/pagination";
import { Decimal } from "decimal.js";
import { EntryStatus } from "@/prisma/generated/prisma/enums";

// Use Prisma's generated type for Account, including relations we commonly fetch
export type Account = Prisma.AccountGetPayload<{
  include: {
    parent: true;
    children: true;
    _count: {
      select: { journalEntryLines: true };
    };
  };
}>;

export type AccountsResult = PaginatedResult<Account> | Account[];

export type CalculatedAccount = Account & {
  ownDebit: number;
  ownCredit: number;
  totalDebit: number;
  totalCredit: number;
  children: string[]; // IDs of children
  calculated: boolean;
  level: number;
};

export type TrialBalanceItem = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  level: number;
  hasChildren: boolean;
  parentId: string | null;
};

export type TrialBalanceResult = {
  items: TrialBalanceItem[];
  totalDebit: number;
  totalCredit: number;
};

export type JournalEntryLineData = {
  id?: string;
  accountId: string;
  debitAmount: Decimal | number;
  creditAmount: Decimal | number;
  description?: string;
  contactId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  lineNumber?: number;
  account?: { name: string; code: string };
  contact?: { name: string } | null;
  department?: { name: string } | null;
  project?: { name: string } | null;
};

export type JournalEntryAttachmentData = {
  id: string;
  name: string;
  url: string;
  size?: number;
  type?: string;
};

export type CreateJournalEntryData = {
  id?: string;
  entryNumber?: string;
  transactionDate: Date;
  description?: string | null;
  notes?: string | null;
  status?: EntryStatus | string;
  lines: JournalEntryLineData[];
  attachments?: JournalEntryAttachmentData[];
  user?: { name: string | null; email: string | null } | null;
};

export type JournalEntryWithDetails = Prisma.JournalEntryGetPayload<{
  include: {
    lines: {
      include: {
        account: true;
        contact: true;
        department: true;
        project: true;
      };
      orderBy: { lineNumber: "asc" };
    };
    user: {
      select: { name: true; email: true };
    };
    attachments: true;
  };
}>;
