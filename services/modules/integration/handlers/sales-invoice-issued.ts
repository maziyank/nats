import { Decimal } from "decimal.js";
import { getRequiredDefaultAccount } from "@/services/lib/accounting/default-account.service";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { salesInvoiceIssuedPayloadSchema } from "@/services/modules/integration/events";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { CalculationService } from "@/services/lib/utils/calculation-service";
import { generateDocumentNumber } from "@/services/lib/document-numbering";

type Tx = Prisma.TransactionClient;

export async function handleSalesInvoiceIssued(tx: Tx, payloadInput: unknown) {
  const payload = salesInvoiceIssuedPayloadSchema.parse(payloadInput);

  const invoice = await tx.salesInvoice.findUnique({
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

  const arAccount = await getRequiredDefaultAccount("ACCOUNTS_RECEIVABLE");
  const revenueAccount = await getRequiredDefaultAccount("SALES_REVENUE");
  const taxAccount = await getRequiredDefaultAccount("SALES_TAX_PAYABLE");
  const discountAccount = await getRequiredDefaultAccount("SALES_DISCOUNT");
  const shippingAccount = await getRequiredDefaultAccount(
    "UNCATEGORIZED_INCOME",
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
    accountId: arAccount.accountId,
    debitAmount: new Decimal(payload.totalAmount),
    creditAmount: new Decimal(0),
    description: `Receivable for Invoice #${invoice.invoiceNumber}`,
    contactId: payload.contactId,
  });

  for (const item of payload.items) {
    const accountId = item.accountId ?? revenueAccount.accountId;

    const calculated = CalculationService.calculateLineItem({
      quantity: Number(item.quantity),
      unitPrice: new Decimal(item.unitPrice),
      discount: item.discount ? new Decimal(item.discount) : 0,
      tax: item.tax ? new Decimal(item.tax) : 0,
    });

    if (calculated.taxableAmount.gt(0)) {
      jeLines.push({
        accountId,
        debitAmount: new Decimal(0),
        creditAmount: calculated.taxableAmount,
        description: item.description,
      });
    }

    if (calculated.taxAmount.gt(0)) {
      jeLines.push({
        accountId: taxAccount.accountId,
        debitAmount: new Decimal(0),
        creditAmount: calculated.taxAmount,
        description: `Tax on ${item.description}`,
      });
    }
  }

  if (new Decimal(payload.shippingCost || 0).gt(0)) {
    jeLines.push({
      accountId: shippingAccount.accountId,
      debitAmount: new Decimal(0),
      creditAmount: new Decimal(payload.shippingCost || 0),
      description: "Shipping Cost",
    });
  }

  if (new Decimal(payload.globalDiscount || 0).gt(0)) {
    jeLines.push({
      accountId: discountAccount.accountId,
      debitAmount: new Decimal(payload.globalDiscount || 0),
      creditAmount: new Decimal(0),
      description: "Global Discount",
    });
  }

  const entryNumber = await generateDocumentNumber(
    "SALES_INVOICE_JOURNAL",
    "Sales Invoice Journal",
    "INV-SALE",
  );
  const journalEntry = await JournalService.createJournalEntry(
    {
      entryNumber,
      transactionDate: invoice.invoiceDate,
      description: `Sales Invoice #${invoice.invoiceNumber}`,
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

  await tx.salesInvoice.update({
    where: { id: invoice.id },
    data: {
      journalEntryId: journalEntry.id,
      status: invoice.status === "DRAFT" ? "ISSUED" : invoice.status,
      ...(invoice.status === "DRAFT"
        ? {
            issuedAt: new Date(),
            issuedById: payload.userId,
          }
        : {}),
    },
  });
}
