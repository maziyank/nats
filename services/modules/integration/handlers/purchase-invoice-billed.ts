import { Decimal } from "decimal.js";
import { getRequiredDefaultAccount } from "@/services/lib/accounting/default-account.service";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { purchaseInvoiceBilledPayloadSchema } from "@/services/modules/integration/events";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { CalculationService } from "@/services/lib/utils/calculation-service";
import { generateDocumentNumber } from "@/services/lib/document-numbering";

type Tx = Prisma.TransactionClient;

export async function handlePurchaseInvoiceBilled(
  tx: Tx,
  payloadInput: unknown,
) {
  const payload = purchaseInvoiceBilledPayloadSchema.parse(payloadInput);

  const invoice = await tx.purchaseInvoice.findUnique({
    where: { id: payload.invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      status: true,
      journalEntryId: true,
      contactId: true,
    },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  if (invoice.journalEntryId) {
    return;
  }

  const apAccount = await getRequiredDefaultAccount("ACCOUNTS_PAYABLE");
  const grniAccount = await getRequiredDefaultAccount(
    "GOODS_RECEIVED_NOT_INVOICED",
  );
  const taxAccount = await getRequiredDefaultAccount("PURCHASE_TAX_RECEIVABLE");
  const expenseAccount = await getRequiredDefaultAccount(
    "UNCATEGORIZED_EXPENSE",
  );

  const jeLines: {
    accountId: string;
    debitAmount: Decimal;
    creditAmount: Decimal;
    description: string;
    contactId?: string;
  }[] = [];

  // lineNumber removed

  jeLines.push({
    accountId: apAccount.accountId,
    debitAmount: new Decimal(0),
    creditAmount: new Decimal(payload.totalAmount),
    description: `Payable for Invoice #${invoice.invoiceNumber}`,
    contactId: payload.contactId,
  });

  for (const item of payload.items) {
    const accountId = item.accountId ?? grniAccount.accountId;

    const calculated = CalculationService.calculateLineItem({
      quantity: Number(item.quantity),
      unitPrice: new Decimal(item.unitPrice),
      discount: item.discount ? new Decimal(item.discount) : 0,
      tax: item.tax ? new Decimal(item.tax) : 0,
    });

    if (calculated.taxableAmount.gt(0)) {
      jeLines.push({
        accountId,
        debitAmount: calculated.taxableAmount,
        creditAmount: new Decimal(0),
        description: item.description,
      });
    }

    if (calculated.taxAmount.gt(0)) {
      jeLines.push({
        accountId: taxAccount.accountId,
        debitAmount: calculated.taxAmount,
        creditAmount: new Decimal(0),
        description: `Tax on ${item.description}`,
      });
    }
  }

  if (new Decimal(payload.shippingCost || 0).gt(0)) {
    jeLines.push({
      accountId: expenseAccount.accountId,
      debitAmount: new Decimal(payload.shippingCost || 0),
      creditAmount: new Decimal(0),
      description: "Shipping Cost",
    });
  }

  if (new Decimal(payload.handlingCost || 0).gt(0)) {
    jeLines.push({
      accountId: expenseAccount.accountId,
      debitAmount: new Decimal(payload.handlingCost || 0),
      creditAmount: new Decimal(0),
      description: "Handling Cost",
    });
  }

  if (new Decimal(payload.globalDiscount || 0).gt(0)) {
    jeLines.push({
      accountId: expenseAccount.accountId,
      debitAmount: new Decimal(0),
      creditAmount: new Decimal(payload.globalDiscount || 0),
      description: "Global Discount",
    });
  }

  const entryNumber = await generateDocumentNumber(
    "PURCHASE_INVOICE_JOURNAL",
    "Purchase Invoice Journal",
    "INV-PURCH",
  );
  const journalEntry = await JournalService.createJournalEntry(
    {
      entryNumber,
      transactionDate: invoice.invoiceDate,
      description: `Purchase Invoice #${invoice.invoiceNumber}`,
      lines: jeLines.map((line) => ({
        ...line,
        debitAmount: line.debitAmount.toNumber(),
        creditAmount: line.creditAmount.toNumber(),
      })),
    },
    payload.userId,
    tx,
  );

  await JournalService.postJournalEntry(journalEntry.id, tx);

  await tx.purchaseInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "BILLED",
      journalEntryId: journalEntry.id,
      billedAt: new Date(),
      billedById: payload.userId,
    },
  });
}
