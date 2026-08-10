import { IntegrationEvent } from "../events";

import { Decimal } from "decimal.js";
import { getRequiredDefaultAccount } from "@/services/lib/accounting/default-account.service";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { generateDocumentNumber } from "@/services/lib/document-numbering";

type Tx = Prisma.TransactionClient;

export const handlePayrollRunCompleted = async (
  tx: Tx,
  payload: Extract<
    IntegrationEvent,
    { type: "PAYROLL_RUN_COMPLETED" }
  >["payload"],
) => {
  console.log("Handling PAYROLL_RUN_COMPLETED event", payload);

  const run = await tx.payrollRun.findUnique({
    where: { id: payload.payrollRunId },
  });

  if (!run) throw new Error("Payroll run not found");
  if (run.journalEntryId) return; // Already processed

  const expenseAccount = await getRequiredDefaultAccount("SALARIES_EXPENSE");
  const liabilityAccount = await getRequiredDefaultAccount("PAYROLL_LIABILITY");

  // Optional specialized liability accounts
  let taxPayableAccountId = liabilityAccount.accountId;
  let bpjsPayableAccountId = liabilityAccount.accountId;
  try {
    const taxAcc = await getRequiredDefaultAccount("PAYROLL_TAX_PAYABLE");
    taxPayableAccountId = taxAcc.accountId;
  } catch {
    // fallback to payroll liability
  }
  try {
    const bpjsAcc = await getRequiredDefaultAccount("BPJS_PAYABLE");
    bpjsPayableAccountId = bpjsAcc.accountId;
  } catch {
    // fallback to payroll liability
  }

  const totalEarnings = new Decimal(run.totalEarnings);
  const netPay = new Decimal(run.netPay);

  // Load slip items for this period to split deductions by component GL / name
  const slips = await tx.salarySlip.findMany({
    where: { periodId: run.periodId },
    include: {
      items: {
        include: { component: true },
      },
    },
  });

  const deductionBuckets = new Map<string, { accountId: string; amount: Decimal; label: string }>();

  for (const slip of slips) {
    for (const item of slip.items) {
      if (item.type !== "DEDUCTION") continue;
      const amount = new Decimal(item.amount);
      if (amount.lte(0)) continue;

      const name = item.component.name.toLowerCase();
      let accountId = item.component.accountId || liabilityAccount.accountId;
      let label = item.component.name;

      if (!item.component.accountId) {
        if (name.includes("pph") || name.includes("tax")) {
          accountId = taxPayableAccountId;
          label = "Payroll Tax Payable";
        } else if (name.includes("bpjs")) {
          accountId = bpjsPayableAccountId;
          label = "BPJS Payable";
        } else {
          accountId = liabilityAccount.accountId;
          label = "Other Payroll Deductions";
        }
      }

      const key = accountId;
      const existing = deductionBuckets.get(key) || {
        accountId,
        amount: new Decimal(0),
        label,
      };
      existing.amount = existing.amount.plus(amount);
      deductionBuckets.set(key, existing);
    }
  }

  const jeLines: Array<{
    accountId: string;
    debitAmount: number;
    creditAmount: number;
    description: string;
  }> = [];

  // Dr Salaries Expense (Gross)
  if (totalEarnings.gt(0)) {
    jeLines.push({
      accountId: expenseAccount.accountId,
      debitAmount: totalEarnings.toNumber(),
      creditAmount: 0,
      description: `Salaries Expense for Period ${run.periodId}`,
    });
  }

  // Cr Net Pay Payable
  if (netPay.gt(0)) {
    jeLines.push({
      accountId: liabilityAccount.accountId,
      debitAmount: 0,
      creditAmount: netPay.toNumber(),
      description: `Net Pay Payable for Period ${run.periodId}`,
    });
  }

  // Cr split deduction liabilities
  for (const bucket of deductionBuckets.values()) {
    if (bucket.amount.lte(0)) continue;
    jeLines.push({
      accountId: bucket.accountId,
      debitAmount: 0,
      creditAmount: bucket.amount.toNumber(),
      description: `${bucket.label} for Period ${run.periodId}`,
    });
  }

  // Create JE
  const entryNumber = await generateDocumentNumber(
    "PAYROLL_JOURNAL",
    "Payroll Journal",
    "PAY",
  );
  const journalEntry = await JournalService.createJournalEntry(
    {
      entryNumber,
      transactionDate: run.runDate,
      description: `Payroll Run ${run.id}`,
      lines: jeLines,
    },
    payload.userId,
    tx,
  );

  // Post JE
  await JournalService.postJournalEntry(journalEntry.id, tx);

  // Link back
  await tx.payrollRun.update({
    where: { id: run.id },
    data: { journalEntryId: journalEntry.id },
  });
};

export const handleSalarySlipPublished = async (
  tx: Tx,
  payload: Extract<
    IntegrationEvent,
    { type: "SALARY_SLIP_PUBLISHED" }
  >["payload"],
) => {
  console.log("Handling SALARY_SLIP_PUBLISHED event", payload);
  // Placeholder: Send email to employee or notify
};
