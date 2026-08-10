import { prisma } from "@/services/lib/prisma";
import { AITool } from "./types";
import {
  Prisma,
  ContactType,
  AccountType,
} from "@/prisma/generated/prisma/client";

// Helper function to convert data to markdown table
function toMarkdownTable(data: any[]): string {
  if (data.length === 0) return "No data found.";
  const headers = Object.keys(data[0]);
  const headerRow = `| ${headers.join(" | ")} |`;
  const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const rows = data
    .map(
      (row) =>
        `| ${Object.values(row)
          .map((val) => String(val ?? ""))
          .join(" | ")} |`,
    )
    .join("\n");
  return `${headerRow}\n${separatorRow}\n${rows}`;
}

function formatMoney(amount: Prisma.Decimal): string {
  return `$${amount.toNumber().toFixed(2)}`;
}

// ============================================================================
// ACCOUNTING MODULE
// ============================================================================

export const getRecentTransactionsTool: AITool = {
  name: "get_recent_transactions",
  description:
    "Get recent financial transactions (journal entries) for the company. Use this to analyze financial activity.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of transactions to retrieve (default 5, max 20)",
      },
    },
    required: [],
  },
  handler: async ({ limit = 5 }: { limit?: number }) => {
    const transactions = await prisma.journalEntry.findMany({
      take: Math.min(limit, 20),
      orderBy: { transactionDate: "desc" },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    const data = transactions.map((t) => {
      const totalAmount = t.lines.reduce(
        (sum, line) => sum.add(line.debitAmount),
        new Prisma.Decimal(0),
      );
      return {
        Date: t.transactionDate.toISOString().split("T")[0],
        Description: t.description,
        Reference: t.entryNumber,
        Amount: totalAmount.toNumber().toFixed(2),
        Status: t.status,
      };
    });

    return toMarkdownTable(data);
  },
};

export const getJournalEntriesDetailedTool: AITool = {
  name: "get_journal_entries_detailed",
  description:
    "Get detailed journal entries with debit/credit lines. Useful for auditing and tracing specific account movements.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of journal entries (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: ["draft", "posted", "all"],
        description: "Filter by entry status (default all)",
      },
      search: {
        type: "string",
        description: "Search by entry number or description",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
    search,
  }: {
    limit?: number;
    status?: string;
    search?: string;
  }) => {
    const where: Prisma.JournalEntryWhereInput = {
      ...(status !== "all" && { status: status as any }),
      ...(search && {
        OR: [
          { entryNumber: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const entries = await prisma.journalEntry.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { transactionDate: "desc" },
      include: {
        lines: {
          include: { account: true },
          orderBy: { lineNumber: "asc" },
        },
      },
    });

    if (entries.length === 0) return "No journal entries found.";

    let markdown = "";
    for (const entry of entries) {
      markdown += `### ${entry.entryNumber} - ${entry.transactionDate.toISOString().split("T")[0]} [${entry.status.toUpperCase()}]\n`;
      markdown += `_${entry.description || "No description"}_\n\n`;
      markdown += `| Account | Debit | Credit |\n| --- | --- | --- |\n`;
      for (const line of entry.lines) {
        markdown += `| ${line.account.code} - ${line.account.name} | ${line.debitAmount.toNumber().toFixed(2)} | ${line.creditAmount.toNumber().toFixed(2)} |\n`;
      }
      const totalDebit = entry.lines.reduce(
        (s, l) => s.add(l.debitAmount),
        new Prisma.Decimal(0),
      );
      markdown += `| **Total** | **${totalDebit.toNumber().toFixed(2)}** | **${totalDebit.toNumber().toFixed(2)}** |\n\n`;
    }
    return markdown;
  },
};

export const getAccountsTool: AITool = {
  name: "get_accounts",
  description:
    "Get chart of accounts with balances. Useful for understanding the company's account structure and balances.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["asset", "liability", "equity", "revenue", "expense", "all"],
        description: "Filter by account type (default all)",
      },
      search: {
        type: "string",
        description: "Search by account code or name",
      },
    },
    required: [],
  },
  handler: async ({
    type = "all",
    search,
  }: {
    type?: string;
    search?: string;
  }) => {
    const where: Prisma.AccountWhereInput = {
      ...(type !== "all" && { type: type as AccountType }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const accounts = await prisma.account.findMany({
      where,
      orderBy: { code: "asc" },
      include: {
        journalEntryLines: {
          select: { debitAmount: true, creditAmount: true },
        },
      },
    });

    const data = accounts.map((acc) => {
      const balance = acc.journalEntryLines.reduce(
        (s, line) =>
          acc.normalBalance === "debit"
            ? s.add(line.debitAmount).sub(line.creditAmount)
            : s.add(line.creditAmount).sub(line.debitAmount),
        new Prisma.Decimal(0),
      );
      return {
        Code: acc.code,
        Name: acc.name,
        Type: acc.type,
        "Normal Balance": acc.normalBalance,
        Balance: balance.toNumber().toFixed(2),
        Active: acc.isActive ? "Yes" : "No",
      };
    });

    return toMarkdownTable(data);
  },
};

export const getTrialBalanceTool: AITool = {
  name: "get_trial_balance",
  description:
    "Get trial balance report showing all accounts with their debit and credit balances. Used to verify that debits equal credits.",
  parameters: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const accounts = await prisma.account.findMany({
      where: { isPosting: true },
      orderBy: { code: "asc" },
      include: {
        journalEntryLines: {
          include: {
            journalEntry: { select: { status: true } },
          },
        },
      },
    });

    const data = accounts
      .map((acc) => {
        const balance = acc.journalEntryLines
          .filter((l) => l.journalEntry.status === "posted")
          .reduce(
            (s, line) =>
              acc.normalBalance === "debit"
                ? s.add(line.debitAmount).sub(line.creditAmount)
                : s.add(line.creditAmount).sub(line.debitAmount),
            new Prisma.Decimal(0),
          );
        return {
          Code: acc.code,
          Name: acc.name,
          Type: acc.type,
          Debit:
            balance.greaterThan(0) && acc.normalBalance === "debit"
              ? balance.toNumber().toFixed(2)
              : "0.00",
          Credit:
            balance.greaterThan(0) && acc.normalBalance === "credit"
              ? balance.toNumber().toFixed(2)
              : "0.00",
        };
      })
      .filter((row) => row.Debit !== "0.00" || row.Credit !== "0.00");

    if (data.length === 0) return "No posted entries found.";

    const totalDebit = data.reduce((s, r) => s + parseFloat(r.Debit), 0);
    const totalCredit = data.reduce((s, r) => s + parseFloat(r.Credit), 0);

    let markdown = `**Trial Balance**\n\n`;
    markdown += toMarkdownTable(data);
    markdown += `\n\n**Total Debit:** $${totalDebit.toFixed(2)} | **Total Credit:** $${totalCredit.toFixed(2)}`;
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      markdown += `\n\n**IMBALANCED** - Difference: $${Math.abs(totalDebit - totalCredit).toFixed(2)}`;
    } else {
      markdown += `\n\n**BALANCED**`;
    }
    return markdown;
  },
};

export const getGeneralLedgerTool: AITool = {
  name: "get_general_ledger",
  description:
    "Get general ledger for a specific account showing all posting transactions. Useful for tracing the history of an account.",
  parameters: {
    type: "object",
    properties: {
      accountCode: {
        type: "string",
        description: "Account code to query (e.g., '1100', '4100')",
      },
      limit: {
        type: "integer",
        description: "Number of transactions (default 20, max 100)",
      },
    },
    required: ["accountCode"],
  },
  handler: async ({
    accountCode,
    limit = 20,
  }: {
    accountCode: string;
    limit?: number;
  }) => {
    const account = await prisma.account.findUnique({
      where: { code: accountCode },
    });
    if (!account) return `Account with code "${accountCode}" not found.`;

    const lines = await prisma.journalEntryLine.findMany({
      where: { accountId: account.id },
      take: Math.min(limit, 100),
      orderBy: { journalEntry: { transactionDate: "desc" } },
      include: {
        journalEntry: {
          select: {
            entryNumber: true,
            transactionDate: true,
            description: true,
          },
        },
      },
    });

    let markdown = `**General Ledger: ${account.code} - ${account.name}**\n\n`;
    markdown += `| Date | Entry # | Description | Debit | Credit |\n| --- | --- | --- | --- | --- |\n`;

    let runningBalance = new Prisma.Decimal(0);
    for (const line of lines.reverse()) {
      const bal =
        account.normalBalance === "debit"
          ? runningBalance.add(line.debitAmount).sub(line.creditAmount)
          : runningBalance.add(line.creditAmount).sub(line.debitAmount);
      runningBalance = bal;
    }

    for (const line of lines) {
      markdown += `| ${line.journalEntry.transactionDate.toISOString().split("T")[0]} | ${line.journalEntry.entryNumber} | ${line.journalEntry.description || "-"} | ${line.debitAmount.toNumber().toFixed(2)} | ${line.creditAmount.toNumber().toFixed(2)} |\n`;
    }

    markdown += `\n**Running Balance:** ${formatMoney(runningBalance)}`;
    return markdown;
  },
};

// ============================================================================
// SALES MODULE
// ============================================================================

export const getSalesOrdersTool: AITool = {
  name: "get_sales_orders",
  description:
    "Get list of sales orders with details. Use for checking order status and history.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of orders (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: [
          "DRAFT",
          "CONFIRMED",
          "PARTIALLY_SHIPPED",
          "SHIPPED",
          "CLOSED",
          "CANCELLED",
          "all",
        ],
        description: "Filter by order status",
      },
      search: {
        type: "string",
        description: "Search by order number or customer name",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
    search,
  }: {
    limit?: number;
    status?: string;
    search?: string;
  }) => {
    const where: Prisma.SalesOrderWhereInput = {
      ...(status !== "all" && { status: status as any }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: "insensitive" } },
          { contact: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
    };

    const orders = await prisma.salesOrder.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: { contact: { select: { name: true } } },
    });

    const data = orders.map((o) => ({
      "Order #": o.orderNumber,
      Customer: o.contact.name,
      Date: o.orderDate.toISOString().split("T")[0],
      Total: formatMoney(o.totalAmount),
      Status: o.status,
    }));

    return toMarkdownTable(data);
  },
};

export const getSalesInvoicesTool: AITool = {
  name: "get_sales_invoices",
  description:
    "Get list of sales invoices with payment status. Use for tracking receivables.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of invoices (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: [
          "DRAFT",
          "ISSUED",
          "PARTIALLY_PAID",
          "PAID",
          "CANCELLED",
          "OVERDUE",
          "all",
        ],
        description: "Filter by invoice status",
      },
      search: {
        type: "string",
        description: "Search by invoice number or customer name",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
    search,
  }: {
    limit?: number;
    status?: string;
    search?: string;
  }) => {
    const where: Prisma.SalesInvoiceWhereInput = {
      ...(status !== "all" && { status: status as any }),
      ...(search && {
        OR: [
          { invoiceNumber: { contains: search, mode: "insensitive" } },
          { contact: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
    };

    const invoices = await prisma.salesInvoice.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: { contact: { select: { name: true } } },
    });

    const data = invoices.map((inv) => ({
      "Invoice #": inv.invoiceNumber,
      Customer: inv.contact.name,
      Date: inv.invoiceDate.toISOString().split("T")[0],
      "Due Date": inv.dueDate.toISOString().split("T")[0],
      Total: formatMoney(inv.totalAmount),
      "Balance Due": formatMoney(inv.balanceDue),
      Status: inv.status,
    }));

    return toMarkdownTable(data);
  },
};

export const getSalesPaymentsTool: AITool = {
  name: "get_sales_payments",
  description:
    "Get list of sales payments received from customers. Use for tracking incoming payments.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of payments (default 10, max 50)",
      },
      search: {
        type: "string",
        description: "Search by payment number or customer name",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    search,
  }: {
    limit?: number;
    search?: string;
  }) => {
    const where: Prisma.SalesPaymentWhereInput = {
      ...(search && {
        OR: [
          { paymentNumber: { contains: search, mode: "insensitive" } },
          { contact: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
    };

    const payments = await prisma.salesPayment.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: {
        contact: { select: { name: true } },
        cashAccount: { select: { name: true } },
      },
    });

    const data = payments.map((p) => ({
      "Payment #": p.paymentNumber,
      Customer: p.contact.name,
      Date: p.paymentDate.toISOString().split("T")[0],
      Amount: formatMoney(p.amount),
      Method: p.method || "N/A",
      "Cash Account": p.cashAccount.name,
    }));

    return toMarkdownTable(data);
  },
};

export const getSalesReturnsTool: AITool = {
  name: "get_sales_returns",
  description:
    "Get list of sales returns (customer returns). Use for tracking returned goods.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of returns (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: ["DRAFT", "APPROVED", "COMPLETED", "CANCELLED", "all"],
        description: "Filter by return status",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
  }: {
    limit?: number;
    status?: string;
  }) => {
    const where: Prisma.SalesReturnWhereInput = {
      ...(status !== "all" && { status: status as any }),
    };

    const returns = await prisma.salesReturn.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: { contact: { select: { name: true } } },
    });

    const data = returns.map((r) => ({
      "Return #": r.returnNumber,
      Customer: r.contact.name,
      Date: r.returnDate.toISOString().split("T")[0],
      Total: formatMoney(r.totalAmount),
      Status: r.status,
      Reason: r.reason || "-",
    }));

    return toMarkdownTable(data);
  },
};

export const getSalesShipmentsTool: AITool = {
  name: "get_sales_shipments",
  description:
    "Get list of sales shipments. Use for tracking outgoing deliveries.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of shipments (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: ["DRAFT", "COMPLETED", "CANCELLED", "all"],
        description: "Filter by shipment status",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
  }: {
    limit?: number;
    status?: string;
  }) => {
    const where: Prisma.SalesShipmentWhereInput = {
      ...(status !== "all" && { status: status as any }),
    };

    const shipments = await prisma.salesShipment.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: { contact: { select: { name: true } } },
    });

    const data = shipments.map((s) => ({
      "Shipment #": s.shipmentNumber,
      Customer: s.contact.name,
      Date: s.shipmentDate.toISOString().split("T")[0],
      Status: s.status,
      Tracking: s.trackingNumber || "-",
      Carrier: s.carrier || "-",
    }));

    return toMarkdownTable(data);
  },
};

export const getSalesSummaryByPeriodTool: AITool = {
  name: "get_sales_summary_by_period",
  description:
    "Get aggregated sales summary by month or year. Shows total invoiced, total paid, outstanding balance, and order count.",
  parameters: {
    type: "object",
    properties: {
      year: {
        type: "integer",
        description: "Year to query (default current year)",
      },
      month: {
        type: "integer",
        description:
          "Specific month (1-12). If omitted, shows yearly summary by month.",
      },
    },
    required: [],
  },
  handler: async ({
    year = new Date().getFullYear(),
    month,
  }: {
    year?: number;
    month?: number;
  }) => {
    const startDate = month
      ? new Date(year, month - 1, 1)
      : new Date(year, 0, 1);
    const endDate = month
      ? new Date(year, month, 0, 23, 59, 59)
      : new Date(year, 11, 31, 23, 59, 59);

    const invoices = await prisma.salesInvoice.findMany({
      where: {
        invoiceDate: { gte: startDate, lte: endDate },
        status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      },
      select: { totalAmount: true, balanceDue: true, invoiceDate: true },
    });

    const payments = await prisma.salesPayment.findMany({
      where: { paymentDate: { gte: startDate, lte: endDate } },
      select: { amount: true, paymentDate: true },
    });

    const totalInvoiced = invoices.reduce(
      (s, i) => s.add(i.totalAmount),
      new Prisma.Decimal(0),
    );
    const totalOutstanding = invoices.reduce(
      (s, i) => s.add(i.balanceDue),
      new Prisma.Decimal(0),
    );
    const totalPaid = payments.reduce(
      (s, p) => s.add(p.amount),
      new Prisma.Decimal(0),
    );

    const monthlyData: Record<
      string,
      { invoiced: number; paid: number; count: number }
    > = {};
    for (const inv of invoices) {
      const key = inv.invoiceDate.toISOString().substring(0, 7);
      if (!monthlyData[key])
        monthlyData[key] = { invoiced: 0, paid: 0, count: 0 };
      monthlyData[key].invoiced += inv.totalAmount.toNumber();
      monthlyData[key].count++;
    }
    for (const p of payments) {
      const key = p.paymentDate.toISOString().substring(0, 7);
      if (!monthlyData[key])
        monthlyData[key] = { invoiced: 0, paid: 0, count: 0 };
      monthlyData[key].paid += p.amount.toNumber();
    }

    let markdown = `**Sales Summary ${month ? `${month}/${year}` : `Year ${year}`}**\n\n`;
    markdown += `- Total Invoiced: ${formatMoney(totalInvoiced)}\n`;
    markdown += `- Total Payments Received: ${formatMoney(totalPaid)}\n`;
    markdown += `- Outstanding Balance: ${formatMoney(totalOutstanding)}\n`;
    markdown += `- Total Invoices: ${invoices.length}\n`;
    markdown += `- Total Payments: ${payments.length}\n\n`;

    if (Object.keys(monthlyData).length > 0) {
      const tableData = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([m, d]) => ({
          Month: m,
          Invoiced: `$${d.invoiced.toFixed(2)}`,
          Paid: `$${d.paid.toFixed(2)}`,
          "Invoice Count": d.count,
        }));
      markdown += `**Monthly Breakdown:**\n${toMarkdownTable(tableData)}`;
    }

    return markdown;
  },
};

export const getSalesSummaryTool: AITool = {
  name: "get_sales_summary",
  description:
    "Get a summary of sales performance including total sales and recent orders.",
  parameters: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const recentOrders = await prisma.salesOrder.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { contact: { select: { name: true } } },
    });

    const totalSales = await prisma.salesInvoice.aggregate({
      _sum: { totalAmount: true },
      where: {
        status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      },
    });

    const totalSalesAmount = totalSales._sum.totalAmount?.toNumber() || 0;

    const data = recentOrders.map((o) => ({
      "Order ID": o.id.substring(0, 8) + "...",
      Customer: o.contact.name,
      Status: o.status,
      Total: o.totalAmount.toNumber().toFixed(2),
      Date: o.createdAt.toISOString().split("T")[0],
    }));

    let markdown = `**Total Sales Revenue:** $${totalSalesAmount.toFixed(2)}\n\n`;
    if (data.length > 0) {
      markdown += `**Recent Orders:**\n${toMarkdownTable(data)}`;
    } else {
      markdown += "No recent orders found.";
    }
    return markdown;
  },
};

// ============================================================================
// PURCHASING MODULE
// ============================================================================

export const getPurchaseOrdersTool: AITool = {
  name: "get_purchase_orders",
  description:
    "Get list of purchase orders. Use for tracking procurement activities.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of orders (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: [
          "DRAFT",
          "ISSUED",
          "PARTIALLY_RECEIVED",
          "CLOSED",
          "CANCELLED",
          "all",
        ],
        description: "Filter by order status",
      },
      search: {
        type: "string",
        description: "Search by order number or vendor name",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
    search,
  }: {
    limit?: number;
    status?: string;
    search?: string;
  }) => {
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(status !== "all" && { status: status as any }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: "insensitive" } },
          { contact: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
    };

    const orders = await prisma.purchaseOrder.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: { contact: { select: { name: true } } },
    });

    const data = orders.map((o) => ({
      "Order #": o.orderNumber,
      Vendor: o.contact.name,
      Date: o.orderDate.toISOString().split("T")[0],
      Expected: o.expectedDate
        ? o.expectedDate.toISOString().split("T")[0]
        : "-",
      Total: formatMoney(o.totalAmount),
      Status: o.status,
    }));

    return toMarkdownTable(data);
  },
};

export const getPurchaseInvoicesTool: AITool = {
  name: "get_purchase_invoices",
  description:
    "Get list of purchase invoices from vendors. Use for tracking payables.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of invoices (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: ["DRAFT", "BILLED", "PARTIALLY_PAID", "PAID", "CANCELED", "all"],
        description: "Filter by invoice status",
      },
      search: {
        type: "string",
        description: "Search by invoice number or vendor name",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
    search,
  }: {
    limit?: number;
    status?: string;
    search?: string;
  }) => {
    const where: Prisma.PurchaseInvoiceWhereInput = {
      ...(status !== "all" && { status: status as any }),
      ...(search && {
        OR: [
          { invoiceNumber: { contains: search, mode: "insensitive" } },
          { contact: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
    };

    const invoices = await prisma.purchaseInvoice.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: { contact: { select: { name: true } } },
    });

    const data = invoices.map((inv) => ({
      "Invoice #": inv.invoiceNumber,
      Vendor: inv.contact.name,
      Date: inv.invoiceDate.toISOString().split("T")[0],
      "Due Date": inv.dueDate.toISOString().split("T")[0],
      Total: formatMoney(inv.totalAmount),
      Status: inv.status,
    }));

    return toMarkdownTable(data);
  },
};

export const getPurchasePaymentsTool: AITool = {
  name: "get_purchase_payments",
  description:
    "Get list of purchase payments made to vendors. Use for tracking outgoing payments.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of payments (default 10, max 50)",
      },
      search: {
        type: "string",
        description: "Search by payment number or vendor name",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    search,
  }: {
    limit?: number;
    search?: string;
  }) => {
    const where: Prisma.PurchasePaymentWhereInput = {
      ...(search && {
        OR: [
          { paymentNumber: { contains: search, mode: "insensitive" } },
          { contact: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
    };

    const payments = await prisma.purchasePayment.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: {
        contact: { select: { name: true } },
        cashAccount: { select: { name: true } },
      },
    });

    const data = payments.map((p) => ({
      "Payment #": p.paymentNumber,
      Vendor: p.contact.name,
      Date: p.paymentDate.toISOString().split("T")[0],
      Amount: formatMoney(p.amount),
      "Cash Account": p.cashAccount.name,
    }));

    return toMarkdownTable(data);
  },
};

export const getPurchaseReturnsTool: AITool = {
  name: "get_purchase_returns",
  description:
    "Get list of purchase returns (returns to vendors). Use for tracking returned goods to suppliers.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of returns (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: ["DRAFT", "APPROVED", "COMPLETED", "CANCELLED", "all"],
        description: "Filter by return status",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
  }: {
    limit?: number;
    status?: string;
  }) => {
    const where: Prisma.PurchaseReturnWhereInput = {
      ...(status !== "all" && { status: status as any }),
    };

    const returns = await prisma.purchaseReturn.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: { contact: { select: { name: true } } },
    });

    const data = returns.map((r) => ({
      "Return #": r.returnNumber,
      Vendor: r.contact.name,
      Date: r.returnDate.toISOString().split("T")[0],
      Total: formatMoney(r.totalAmount),
      Status: r.status,
      Reason: r.reason || "-",
    }));

    return toMarkdownTable(data);
  },
};

export const getPurchaseReceivesTool: AITool = {
  name: "get_purchase_receives",
  description:
    "Get list of purchase receives (goods received from vendors). Use for tracking incoming inventory.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of receives (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: ["DRAFT", "COMPLETED", "CANCELLED", "all"],
        description: "Filter by receive status",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
  }: {
    limit?: number;
    status?: string;
  }) => {
    const where: Prisma.PurchaseReceiveWhereInput = {
      ...(status !== "all" && { status: status as any }),
    };

    const receives = await prisma.purchaseReceive.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: { contact: { select: { name: true } } },
    });

    const data = receives.map((r) => ({
      "Receive #": r.receiveNumber,
      Vendor: r.contact.name,
      Date: r.receiveDate.toISOString().split("T")[0],
      Status: r.status,
      Notes: r.notes || "-",
    }));

    return toMarkdownTable(data);
  },
};

export const getPurchasingSummaryByPeriodTool: AITool = {
  name: "get_purchasing_summary_by_period",
  description:
    "Get aggregated purchasing summary by month or year. Shows total invoiced, total paid, outstanding payables, and transaction count.",
  parameters: {
    type: "object",
    properties: {
      year: {
        type: "integer",
        description: "Year to query (default current year)",
      },
      month: {
        type: "integer",
        description:
          "Specific month (1-12). If omitted, shows yearly summary by month.",
      },
    },
    required: [],
  },
  handler: async ({
    year = new Date().getFullYear(),
    month,
  }: {
    year?: number;
    month?: number;
  }) => {
    const startDate = month
      ? new Date(year, month - 1, 1)
      : new Date(year, 0, 1);
    const endDate = month
      ? new Date(year, month, 0, 23, 59, 59)
      : new Date(year, 11, 31, 23, 59, 59);

    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        invoiceDate: { gte: startDate, lte: endDate },
        status: { in: ["BILLED", "PARTIALLY_PAID", "PAID"] },
      },
      select: { totalAmount: true, invoiceDate: true },
    });

    const payments = await prisma.purchasePayment.findMany({
      where: { paymentDate: { gte: startDate, lte: endDate } },
      select: { amount: true, paymentDate: true },
    });

    const totalInvoiced = invoices.reduce(
      (s, i) => s.add(i.totalAmount),
      new Prisma.Decimal(0),
    );
    const totalPaid = payments.reduce(
      (s, p) => s.add(p.amount),
      new Prisma.Decimal(0),
    );
    const outstanding = totalInvoiced.sub(totalPaid);

    const monthlyData: Record<
      string,
      { invoiced: number; paid: number; count: number }
    > = {};
    for (const inv of invoices) {
      const key = inv.invoiceDate.toISOString().substring(0, 7);
      if (!monthlyData[key])
        monthlyData[key] = { invoiced: 0, paid: 0, count: 0 };
      monthlyData[key].invoiced += inv.totalAmount.toNumber();
      monthlyData[key].count++;
    }
    for (const p of payments) {
      const key = p.paymentDate.toISOString().substring(0, 7);
      if (!monthlyData[key])
        monthlyData[key] = { invoiced: 0, paid: 0, count: 0 };
      monthlyData[key].paid += p.amount.toNumber();
    }

    let markdown = `**Purchasing Summary ${month ? `${month}/${year}` : `Year ${year}`}**\n\n`;
    markdown += `- Total Invoiced: ${formatMoney(totalInvoiced)}\n`;
    markdown += `- Total Payments Made: ${formatMoney(totalPaid)}\n`;
    markdown += `- Outstanding Payables: ${formatMoney(outstanding)}\n`;
    markdown += `- Total Invoices: ${invoices.length}\n`;
    markdown += `- Total Payments: ${payments.length}\n\n`;

    if (Object.keys(monthlyData).length > 0) {
      const tableData = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([m, d]) => ({
          Month: m,
          Invoiced: `$${d.invoiced.toFixed(2)}`,
          Paid: `$${d.paid.toFixed(2)}`,
          "Invoice Count": d.count,
        }));
      markdown += `**Monthly Breakdown:**\n${toMarkdownTable(tableData)}`;
    }

    return markdown;
  },
};

// ============================================================================
// CASH & BANK MODULE
// ============================================================================

export const getCashAccountsTool: AITool = {
  name: "get_cash_accounts",
  description:
    "Get list of cash/bank accounts with their GL account links. Use for checking available payment accounts.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["CASH", "BANK", "PETTY_CASH", "EWALLET", "all"],
        description: "Filter by account type",
      },
    },
    required: [],
  },
  handler: async ({ type = "all" }: { type?: string }) => {
    const where: Prisma.CashAccountWhereInput = {
      isActive: true,
      ...(type !== "all" && { type: type as any }),
    };

    const accounts = await prisma.cashAccount.findMany({
      where,
      include: { glAccount: { select: { code: true, name: true } } },
    });

    const data = accounts.map((a) => ({
      Name: a.name,
      Type: a.type,
      "Account #": a.accountNumber || "-",
      Bank: a.bankName || "-",
      "GL Account": `${a.glAccount.code} - ${a.glAccount.name}`,
    }));

    return toMarkdownTable(data);
  },
};

export const getCashTransactionsTool: AITool = {
  name: "get_cash_transactions",
  description:
    "Get list of cash transactions (income/expense). Use for tracking cash flow activities.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of transactions (default 10, max 50)",
      },
      type: {
        type: "string",
        enum: ["INCOME", "EXPENSE", "all"],
        description: "Filter by transaction type",
      },
      search: {
        type: "string",
        description: "Search by description or reference",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    type = "all",
    search,
  }: {
    limit?: number;
    type?: string;
    search?: string;
  }) => {
    const where: Prisma.CashTransactionWhereInput = {
      ...(type !== "all" && { type: type as any }),
      ...(search && {
        OR: [
          { description: { contains: search, mode: "insensitive" } },
          { reference: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const transactions = await prisma.cashTransaction.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { date: "desc" },
      include: {
        cashAccount: { select: { name: true } },
        contact: { select: { name: true } },
      },
    });

    const data = transactions.map((t) => ({
      Date: t.date.toISOString().split("T")[0],
      Type: t.type,
      Description: t.description || "-",
      Contact: t.contact?.name || "-",
      "Cash Account": t.cashAccount.name,
      Status: t.status,
    }));

    return toMarkdownTable(data);
  },
};

export const getCashTransfersTool: AITool = {
  name: "get_cash_transfers",
  description:
    "Get list of cash transfers between accounts. Use for tracking inter-account movements.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of transfers (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: ["PENDING", "APPROVED", "REJECTED", "all"],
        description: "Filter by transfer status",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
  }: {
    limit?: number;
    status?: string;
  }) => {
    const where: Prisma.CashTransferWhereInput = {
      ...(status !== "all" && { status: status as any }),
    };

    const transfers = await prisma.cashTransfer.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { date: "desc" },
      include: {
        fromAccount: { select: { name: true } },
        toAccount: { select: { name: true } },
      },
    });

    const data = transfers.map((t) => ({
      Date: t.date.toISOString().split("T")[0],
      From: t.fromAccount.name,
      To: t.toAccount.name,
      Amount: formatMoney(t.amount),
      Reference: t.reference || "-",
      Status: t.status,
    }));

    return toMarkdownTable(data);
  },
};

export const getCashFlowSummaryTool: AITool = {
  name: "get_cash_flow_summary",
  description:
    "Get aggregated cash flow summary showing income, expenses, and net cash flow by period.",
  parameters: {
    type: "object",
    properties: {
      year: {
        type: "integer",
        description: "Year to query (default current year)",
      },
      month: {
        type: "integer",
        description:
          "Specific month (1-12). If omitted, shows yearly by month.",
      },
    },
    required: [],
  },
  handler: async ({
    year = new Date().getFullYear(),
    month,
  }: {
    year?: number;
    month?: number;
  }) => {
    const startDate = month
      ? new Date(year, month - 1, 1)
      : new Date(year, 0, 1);
    const endDate = month
      ? new Date(year, month, 0, 23, 59, 59)
      : new Date(year, 11, 31, 23, 59, 59);

    const transactions = await prisma.cashTransaction.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: "APPROVED" },
      select: { type: true, date: true },
    });

    const incomeCount = transactions.filter((t) => t.type === "INCOME").length;
    const expenseCount = transactions.filter(
      (t) => t.type === "EXPENSE",
    ).length;

    const monthlyData: Record<string, { income: number; expense: number }> = {};
    for (const t of transactions) {
      const key = t.date.toISOString().substring(0, 7);
      if (!monthlyData[key]) monthlyData[key] = { income: 0, expense: 0 };
      if (t.type === "INCOME") monthlyData[key].income++;
      else monthlyData[key].expense++;
    }

    let markdown = `**Cash Flow Summary ${month ? `${month}/${year}` : `Year ${year}`}**\n\n`;
    markdown += `- Total Income Transactions: ${incomeCount}\n`;
    markdown += `- Total Expense Transactions: ${expenseCount}\n`;
    markdown += `- Net Transactions: ${incomeCount - expenseCount}\n\n`;

    if (Object.keys(monthlyData).length > 0) {
      const tableData = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([m, d]) => ({
          Month: m,
          Income: d.income,
          Expense: d.expense,
          Net: d.income - d.expense,
        }));
      markdown += `**Monthly Breakdown:**\n${toMarkdownTable(tableData)}`;
    }

    return markdown;
  },
};

// ============================================================================
// INVENTORY MODULE
// ============================================================================

export const getInventoryStatusTool: AITool = {
  name: "get_inventory_status",
  description:
    "Get current inventory stock levels for products. Use this to check product availability.",
  parameters: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description: "Search term for product name or SKU",
      },
    },
    required: [],
  },
  handler: async ({ search }: { search?: string }) => {
    const where: Prisma.ProductWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const products = await prisma.product.findMany({
      where,
      take: 10,
      select: {
        name: true,
        sku: true,
        price: true,
        averageCost: true,
        inventory: { select: { quantity: true } },
      },
    });

    const data = products.map((p) => {
      const totalQuantity = p.inventory.reduce(
        (sum, inv) => sum + inv.quantity,
        0,
      );
      const estimatedValue = p.averageCost.mul(totalQuantity).toNumber();
      return {
        "Product Name": p.name,
        SKU: p.sku,
        "Stock Level": totalQuantity,
        Price: p.price.toNumber().toFixed(2),
        Value: estimatedValue.toFixed(2),
      };
    });

    return toMarkdownTable(data);
  },
};

export const getLowStockAlertTool: AITool = {
  name: "get_low_stock_alert",
  description:
    "Get products that are running low on stock (below minimum stock level). Use for inventory planning and reordering.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of products (default 20, max 100)",
      },
    },
    required: [],
  },
  handler: async ({ limit = 20 }: { limit?: number }) => {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      take: Math.min(limit, 100),
      select: {
        name: true,
        sku: true,
        minStock: true,
        averageCost: true,
        inventory: { select: { quantity: true } },
      },
    });

    const lowStock = products
      .map((p) => {
        const totalQty = p.inventory.reduce((s, i) => s + i.quantity, 0);
        return {
          "Product Name": p.name,
          SKU: p.sku,
          "Current Stock": totalQty,
          "Min Stock": p.minStock,
          Deficit: Math.max(0, p.minStock - totalQty),
          "Unit Cost": formatMoney(p.averageCost),
        };
      })
      .filter((p) => p["Current Stock"] < p["Min Stock"])
      .sort((a, b) => b.Deficit - a.Deficit);

    return toMarkdownTable(lowStock);
  },
};

export const getInventoryMovementsTool: AITool = {
  name: "get_inventory_movements",
  description:
    "Get list of inventory movements (IN, OUT, TRANSFER, ADJUSTMENT). Use for tracking stock movements.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of movements (default 10, max 50)",
      },
      type: {
        type: "string",
        enum: [
          "IN",
          "OUT",
          "TRANSFER",
          "ADJUSTMENT",
          "PRODUCTION_IN",
          "PRODUCTION_OUT",
          "all",
        ],
        description: "Filter by movement type",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    type = "all",
  }: {
    limit?: number;
    type?: string;
  }) => {
    const where: Prisma.InventoryMovementWhereInput = {
      ...(type !== "all" && { type: type as any }),
    };

    const movements = await prisma.inventoryMovement.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { transactionDate: "desc" },
      include: {
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
      },
    });

    const data = movements.map((m) => ({
      Date: m.transactionDate.toISOString().split("T")[0],
      Type: m.type,
      Reference: m.reference || "-",
      From: m.fromWarehouse?.name || "-",
      To: m.toWarehouse?.name || "-",
      Status: m.status,
    }));

    return toMarkdownTable(data);
  },
};

export const getInventoryValuationTool: AITool = {
  name: "get_inventory_valuation",
  description:
    "Get inventory valuation summary showing total stock value by product and warehouse.",
  parameters: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description: "Search by product name or SKU",
      },
    },
    required: [],
  },
  handler: async ({ search }: { search?: string }) => {
    const where: Prisma.ProductWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const products = await prisma.product.findMany({
      where,
      select: {
        name: true,
        sku: true,
        inventory: {
          select: {
            quantity: true,
            unitCost: true,
            warehouse: { select: { name: true } },
          },
        },
      },
    });

    let totalValue = 0;
    const data = products.flatMap((p) =>
      p.inventory.map((inv) => {
        const value = inv.unitCost.mul(inv.quantity).toNumber();
        totalValue += value;
        return {
          "Product Name": p.name,
          SKU: p.sku,
          Warehouse: inv.warehouse.name,
          Quantity: inv.quantity,
          "Unit Cost": formatMoney(inv.unitCost),
          Value: `$${value.toFixed(2)}`,
        };
      }),
    );

    let markdown = `**Total Inventory Value: $${totalValue.toFixed(2)}**\n\n`;
    markdown += toMarkdownTable(data);
    return markdown;
  },
};

// ============================================================================
// FINANCIAL REPORTS
// ============================================================================

export const getFinancialReportTool: AITool = {
  name: "get_financial_report",
  description:
    "Get key financial reports like Profit & Loss, Balance Sheet, Cash Flow, Equity Change, or Financial Ratios. Prefer run_standard_report for full native-parity output.",
  parameters: {
    type: "object",
    properties: {
      reportType: {
        type: "string",
        enum: [
          "profit_loss",
          "balance_sheet",
          "cash_flow",
          "equity_change",
          "financial_ratios",
        ],
        description: "Type of financial report to retrieve",
      },
      startDate: {
        type: "string",
        description: "Start date YYYY-MM-DD (period reports)",
      },
      endDate: {
        type: "string",
        description: "End / as-of date YYYY-MM-DD",
      },
    },
    required: ["reportType"],
  },
  handler: async ({
    reportType,
    startDate,
    endDate,
  }: {
    reportType: string;
    startDate?: string;
    endDate?: string;
  }) => {
    // Delegate to standard report tool for full parity with native reporting
    const { runStandardReportTool } = await import("./tools/report-tools");
    const end = endDate || new Date().toISOString().slice(0, 10);
    const start =
      startDate ||
      new Date(new Date(end).getFullYear(), 0, 1).toISOString().slice(0, 10);
    return runStandardReportTool.handler({
      reportCode: reportType,
      startDate: start,
      endDate: end,
      asOfDate: end,
      includeAnalysis: true,
    });
  },
};

// ============================================================================
// PEOPLE MODULE
// ============================================================================

export const getContactsTool: AITool = {
  name: "get_contacts",
  description: "Get list of customers and vendors.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["customer", "vendor", "all"],
        description: "Type of contact to retrieve",
      },
      limit: {
        type: "integer",
        description: "Number of contacts (default 10)",
      },
    },
    required: [],
  },
  handler: async ({
    type = "all",
    limit = 10,
  }: {
    type?: string;
    limit?: number;
  }) => {
    const where: Prisma.ContactWhereInput =
      type !== "all" ? { type: type.toUpperCase() as ContactType } : {};
    const contacts = await prisma.contact.findMany({
      where,
      take: limit,
      select: { name: true, email: true, phone: true, type: true },
    });
    return toMarkdownTable(contacts);
  },
};

export const getEmployeesTool: AITool = {
  name: "get_employees",
  description: "Get list of employees.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of employees (default 10)",
      },
    },
    required: [],
  },
  handler: async ({ limit = 10 }: { limit?: number }) => {
    const employees = await prisma.contact.findMany({
      where: { type: ContactType.EMPLOYEE },
      take: limit,
      select: {
        name: true,
        email: true,
        phone: true,
        employeeDetail: {
          select: { jobTitle: true, department: true },
        },
      },
    });

    const data = employees.map((e) => ({
      Name: e.name,
      Email: e.email,
      Phone: e.phone,
      Position: e.employeeDetail?.jobTitle || "N/A",
      Department: e.employeeDetail?.department || "N/A",
    }));

    return toMarkdownTable(data);
  },
};

// ============================================================================
// PAYROLL MODULE
// ============================================================================

export const getPayrollRunsTool: AITool = {
  name: "get_payroll_runs",
  description:
    "Get list of payroll runs with earnings, deductions, and net pay. Use for tracking payroll processing.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of payroll runs (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: ["DRAFT", "PROCESSING", "COMPLETED", "CANCELLED", "all"],
        description: "Filter by status",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
  }: {
    limit?: number;
    status?: string;
  }) => {
    const where: Prisma.PayrollRunWhereInput = {
      ...(status !== "all" && { status: status as any }),
    };

    const runs = await prisma.payrollRun.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: { period: { select: { name: true } } },
    });

    const data = runs.map((r) => ({
      Period: r.period.name,
      "Run Date": r.runDate.toISOString().split("T")[0],
      "Total Earnings": formatMoney(r.totalEarnings),
      "Total Deductions": formatMoney(r.totalDeductions),
      "Net Pay": formatMoney(r.netPay),
      Status: r.status,
    }));

    return toMarkdownTable(data);
  },
};

export const getSalarySlipsTool: AITool = {
  name: "get_salary_slips",
  description:
    "Get list of salary slips for employees. Use for individual payroll details.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of salary slips (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: ["DRAFT", "PUBLISHED", "PAID", "CANCELLED", "all"],
        description: "Filter by slip status",
      },
      search: {
        type: "string",
        description: "Search by employee name",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
    search,
  }: {
    limit?: number;
    status?: string;
    search?: string;
  }) => {
    const where: Prisma.SalarySlipWhereInput = {
      ...(status !== "all" && { status: status as any }),
      ...(search && {
        contact: { name: { contains: search, mode: "insensitive" } },
      }),
    };

    const slips = await prisma.salarySlip.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: {
        contact: { select: { name: true } },
        period: { select: { name: true } },
      },
    });

    const data = slips.map((s) => ({
      Employee: s.contact.name,
      Period: s.period.name,
      "Gross Salary": formatMoney(s.grossSalary),
      Deductions: formatMoney(s.totalDeductions),
      "Net Salary": formatMoney(s.netSalary),
      Status: s.status,
    }));

    return toMarkdownTable(data);
  },
};

export const getPayrollSummaryTool: AITool = {
  name: "get_payroll_summary",
  description:
    "Get aggregated payroll summary showing total earnings, deductions, and net pay by period.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of periods (default 6)",
      },
    },
    required: [],
  },
  handler: async ({ limit = 6 }: { limit?: number }) => {
    const periods = await prisma.payrollPeriod.findMany({
      take: limit,
      orderBy: { startDate: "desc" },
      select: {
        name: true,
        status: true,
        salarySlips: {
          select: {
            grossSalary: true,
            totalDeductions: true,
            netSalary: true,
          },
        },
      },
    });

    const data = periods.map((p) => {
      const totalGross = p.salarySlips.reduce(
        (s, slip) => s.add(slip.grossSalary),
        new Prisma.Decimal(0),
      );
      const totalDeductions = p.salarySlips.reduce(
        (s, slip) => s.add(slip.totalDeductions),
        new Prisma.Decimal(0),
      );
      const totalNet = p.salarySlips.reduce(
        (s, slip) => s.add(slip.netSalary),
        new Prisma.Decimal(0),
      );
      return {
        Period: p.name,
        Status: p.status,
        Employees: p.salarySlips.length,
        "Total Gross": formatMoney(totalGross),
        "Total Deductions": formatMoney(totalDeductions),
        "Total Net Pay": formatMoney(totalNet),
      };
    });

    return toMarkdownTable(data);
  },
};

// ============================================================================
// ASSET MODULE
// ============================================================================

export const getAssetsTool: AITool = {
  name: "get_assets",
  description: "Get list of company assets.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "integer", description: "Number of assets (default 10)" },
    },
    required: [],
  },
  handler: async ({ limit = 10 }: { limit?: number }) => {
    const assets = await prisma.asset.findMany({
      take: limit,
      select: {
        name: true,
        code: true,
        category: { select: { name: true } },
        purchaseDate: true,
        acquisitionCost: true,
        status: true,
      },
    });
    const data = assets.map((a) => ({
      Name: a.name,
      Code: a.code,
      Category: a.category.name,
      "Purchase Date": a.purchaseDate.toISOString().split("T")[0],
      Cost: a.acquisitionCost.toNumber().toFixed(2),
      Status: a.status,
    }));
    return toMarkdownTable(data);
  },
};

export const getAssetSummaryTool: AITool = {
  name: "get_asset_summary",
  description:
    "Get asset summary with total acquisition cost, current book value, and depreciation info.",
  parameters: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const assets = await prisma.asset.findMany({
      select: {
        acquisitionCost: true,
        currentBookValue: true,
        status: true,
      },
    });

    const totalCost = assets.reduce(
      (s, a) => s.add(a.acquisitionCost),
      new Prisma.Decimal(0),
    );
    const totalBookValue = assets.reduce(
      (s, a) => s.add(a.currentBookValue),
      new Prisma.Decimal(0),
    );
    const totalDepreciation = totalCost.sub(totalBookValue);

    const byStatus: Record<string, number> = {};
    for (const a of assets) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    }

    let markdown = `**Asset Summary**\n\n`;
    markdown += `- Total Assets: ${assets.length}\n`;
    markdown += `- Total Acquisition Cost: ${formatMoney(totalCost)}\n`;
    markdown += `- Total Current Book Value: ${formatMoney(totalBookValue)}\n`;
    markdown += `- Total Accumulated Depreciation: ${formatMoney(totalDepreciation)}\n\n`;

    markdown += `**By Status:**\n`;
    for (const [status, count] of Object.entries(byStatus)) {
      markdown += `- ${status}: ${count}\n`;
    }
    return markdown;
  },
};

export const getDepreciationScheduleTool: AITool = {
  name: "get_depreciation_schedule",
  description:
    "Get depreciation schedules for assets. Use for tracking upcoming and posted depreciation.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of entries (default 20, max 100)",
      },
      posted: {
        type: "boolean",
        description: "Filter by posted status (true=posted, false=pending)",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 20,
    posted,
  }: {
    limit?: number;
    posted?: boolean;
  }) => {
    const where: Prisma.DepreciationScheduleWhereInput = {
      ...(posted !== undefined && { isPosted: posted }),
    };

    const schedules = await prisma.depreciationSchedule.findMany({
      where,
      take: Math.min(limit, 100),
      orderBy: { date: "desc" },
      include: {
        asset: { select: { name: true, code: true } },
      },
    });

    const data = schedules.map((s) => ({
      Asset: s.asset.name,
      Code: s.asset.code,
      Date: s.date.toISOString().split("T")[0],
      Amount: formatMoney(s.amount),
      "Book Value After": formatMoney(s.bookValueAfter),
      Posted: s.isPosted ? "Yes" : "No",
    }));

    return toMarkdownTable(data);
  },
};

// ============================================================================
// BUDGETING MODULE
// ============================================================================

export const getBudgetsTool: AITool = {
  name: "get_budgets",
  description: "Get budget information.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "integer", description: "Number of budgets (default 10)" },
    },
    required: [],
  },
  handler: async ({ limit = 10 }: { limit?: number }) => {
    const budgets = await prisma.budget.findMany({
      take: limit,
      select: { name: true, fiscalYear: true, totalAmount: true, status: true },
    });
    const data = budgets.map((b) => ({
      Name: b.name,
      Year: b.fiscalYear,
      Amount: b.totalAmount.toNumber().toFixed(2),
      Status: b.status,
    }));
    return toMarkdownTable(data);
  },
};

export const getBudgetDetailsTool: AITool = {
  name: "get_budget_details",
  description:
    "Get detailed budget information including line items and monthly breakdown for a specific budget.",
  parameters: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description: "Search by budget name or fiscal year",
      },
    },
    required: [],
  },
  handler: async ({ search }: { search?: string }) => {
    const where: Prisma.BudgetWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { fiscalYear: parseInt(search) || undefined },
          ],
        }
      : {};

    const budgets = await prisma.budget.findMany({
      where,
      take: 5,
      orderBy: { fiscalYear: "desc" },
      include: {
        items: {
          include: { account: { select: { code: true, name: true } } },
        },
        department: { select: { name: true } },
        project: { select: { name: true } },
      },
    });

    if (budgets.length === 0) return "No budgets found.";

    let markdown = "";
    for (const budget of budgets) {
      markdown += `### ${budget.name} (FY ${budget.fiscalYear}) - ${budget.status}\n`;
      markdown += `Total: ${formatMoney(budget.totalAmount)}`;
      if (budget.department) markdown += ` | Dept: ${budget.department.name}`;
      if (budget.project) markdown += ` | Project: ${budget.project.name}`;
      markdown += `\n\n`;

      if (budget.items.length > 0) {
        markdown += `| Account | Total | Jan | Feb | Mar | Apr | May | Jun |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
        for (const item of budget.items) {
          markdown += `| ${item.account.code} - ${item.account.name} | ${formatMoney(item.totalAmount)} | ${formatMoney(item.january)} | ${formatMoney(item.february)} | ${formatMoney(item.march)} | ${formatMoney(item.april)} | ${formatMoney(item.may)} | ${formatMoney(item.june)} |\n`;
        }
        markdown += "\n";
      }
    }
    return markdown;
  },
};

// ============================================================================
// WAREHOUSE MODULE
// ============================================================================

export const getWarehousesTool: AITool = {
  name: "get_warehouses",
  description: "Get list of warehouses and locations.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of warehouses (default 10)",
      },
    },
    required: [],
  },
  handler: async ({ limit = 10 }: { limit?: number }) => {
    const warehouses = await prisma.warehouse.findMany({
      take: limit,
      select: { name: true },
    });
    return toMarkdownTable(warehouses);
  },
};

// ============================================================================
// PRODUCTION MODULE
// ============================================================================

export const getProductionOrdersTool: AITool = {
  name: "get_production_orders",
  description:
    "Get list of production orders. Use for tracking manufacturing activities.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of orders (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: [
          "DRAFT",
          "RELEASED",
          "IN_PROGRESS",
          "COMPLETED",
          "CANCELLED",
          "all",
        ],
        description: "Filter by production order status",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
  }: {
    limit?: number;
    status?: string;
  }) => {
    const where: Prisma.ProductionOrderWhereInput = {
      ...(status !== "all" && { status: status as any }),
    };

    const orders = await prisma.productionOrder.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true, sku: true } },
        billOfMaterial: { select: { bomNumber: true } },
      },
    });

    const data = orders.map((o) => ({
      "Order #": o.orderNumber,
      Product: o.product.name,
      SKU: o.product.sku,
      BOM: o.billOfMaterial?.bomNumber || "-",
      "Planned Qty": o.plannedQuantity,
      "Produced Qty": o.producedQuantity,
      "Start Date": o.startDate ? o.startDate.toISOString().split("T")[0] : "-",
      "End Date": o.endDate ? o.endDate.toISOString().split("T")[0] : "-",
      Status: o.status,
    }));

    return toMarkdownTable(data);
  },
};

export const getBOMListTool: AITool = {
  name: "get_bom_list",
  description:
    "Get list of Bills of Material (BOM) with their items. Use for understanding product recipes/structures.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of BOMs (default 10, max 50)",
      },
      search: {
        type: "string",
        description: "Search by BOM number or name",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    search,
  }: {
    limit?: number;
    search?: string;
  }) => {
    const where: Prisma.BillOfMaterialWhereInput = {
      ...(search && {
        OR: [
          { bomNumber: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const boms = await prisma.billOfMaterial.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true, sku: true } },
        items: {
          include: { product: { select: { name: true, sku: true } } },
        },
      },
    });

    if (boms.length === 0) return "No BOMs found.";

    let markdown = "";
    for (const bom of boms) {
      markdown += `### ${bom.bomNumber} - ${bom.name}\n`;
      markdown += `Product: ${bom.product.name} (${bom.product.sku}) | Qty: ${bom.quantity} | Active: ${bom.isActive ? "Yes" : "No"}\n\n`;
      if (bom.items.length > 0) {
        markdown += `| Component | SKU | Qty | Unit Cost |\n| --- | --- | --- | --- |\n`;
        for (const item of bom.items) {
          markdown += `| ${item.product.name} | ${item.product.sku} | ${item.quantity} | ${item.unitCost ? formatMoney(item.unitCost) : "-"} |\n`;
        }
        markdown += "\n";
      }
    }
    return markdown;
  },
};

export const getProductionSummaryTool: AITool = {
  name: "get_production_summary",
  description:
    "Get aggregated production summary showing total orders, completion rate, and output quantities.",
  parameters: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const orders = await prisma.productionOrder.findMany({
      select: {
        status: true,
        plannedQuantity: true,
        producedQuantity: true,
      },
    });

    const byStatus: Record<string, number> = {};
    let totalPlanned = 0;
    let totalProduced = 0;
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      totalPlanned += o.plannedQuantity;
      totalProduced += o.producedQuantity;
    }

    const completionRate =
      totalPlanned > 0
        ? ((totalProduced / totalPlanned) * 100).toFixed(1)
        : "0.0";

    let markdown = `**Production Summary**\n\n`;
    markdown += `- Total Production Orders: ${orders.length}\n`;
    markdown += `- Total Planned Quantity: ${totalPlanned}\n`;
    markdown += `- Total Produced Quantity: ${totalProduced}\n`;
    markdown += `- Completion Rate: ${completionRate}%\n\n`;

    markdown += `**By Status:**\n`;
    for (const [status, count] of Object.entries(byStatus)) {
      markdown += `- ${status}: ${count}\n`;
    }
    return markdown;
  },
};

// ============================================================================
// POS MODULE
// ============================================================================

export const getPOSSessionsTool: AITool = {
  name: "get_pos_sessions",
  description:
    "Get list of POS sessions with cash summary. Use for tracking retail/daily sales sessions.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Number of sessions (default 10, max 50)",
      },
      status: {
        type: "string",
        enum: ["OPEN", "CLOSED", "all"],
        description: "Filter by session status",
      },
    },
    required: [],
  },
  handler: async ({
    limit = 10,
    status = "all",
  }: {
    limit?: number;
    status?: string;
  }) => {
    const where: Prisma.POSSessionWhereInput = {
      ...(status !== "all" && { status: status as any }),
    };

    const sessions = await prisma.pOSSession.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: "desc" },
      include: {
        warehouse: { select: { name: true } },
        _count: {
          select: {
            salesOrders: true,
            salesInvoices: true,
            salesPayments: true,
          },
        },
      },
    });

    const data = sessions.map((s) => ({
      "Session #": s.sessionNumber,
      Start: s.startTime.toISOString().split("T")[0],
      End: s.endTime ? s.endTime.toISOString().split("T")[0] : "-",
      Warehouse: s.warehouse?.name || "-",
      "Opening Cash": formatMoney(s.openingCash),
      "Closing Cash": s.closingCash ? formatMoney(s.closingCash) : "-",
      "Actual Cash": s.actualCash ? formatMoney(s.actualCash) : "-",
      Difference: s.difference ? formatMoney(s.difference) : "-",
      Orders: s._count.salesOrders,
      Status: s.status,
    }));

    return toMarkdownTable(data);
  },
};

// ============================================================================
// EXPORT ALL TOOLS
// ============================================================================

export const businessTools = [
  // Accounting
  getRecentTransactionsTool,
  getJournalEntriesDetailedTool,
  getAccountsTool,
  getTrialBalanceTool,
  getGeneralLedgerTool,
  // Sales
  getSalesOrdersTool,
  getSalesInvoicesTool,
  getSalesPaymentsTool,
  getSalesReturnsTool,
  getSalesShipmentsTool,
  getSalesSummaryTool,
  getSalesSummaryByPeriodTool,
  // Purchasing
  getPurchaseOrdersTool,
  getPurchaseInvoicesTool,
  getPurchasePaymentsTool,
  getPurchaseReturnsTool,
  getPurchaseReceivesTool,
  getPurchasingSummaryByPeriodTool,
  // Cash & Bank
  getCashAccountsTool,
  getCashTransactionsTool,
  getCashTransfersTool,
  getCashFlowSummaryTool,
  // Inventory
  getInventoryStatusTool,
  getInventoryMovementsTool,
  getInventoryValuationTool,
  getLowStockAlertTool,
  // Financial Reports
  getFinancialReportTool,
  // People
  getContactsTool,
  getEmployeesTool,
  // Payroll
  getPayrollRunsTool,
  getSalarySlipsTool,
  getPayrollSummaryTool,
  // Assets
  getAssetsTool,
  getAssetSummaryTool,
  getDepreciationScheduleTool,
  // Budgeting
  getBudgetsTool,
  getBudgetDetailsTool,
  // Warehouse
  getWarehousesTool,
  // Production
  getProductionOrdersTool,
  getBOMListTool,
  getProductionSummaryTool,
  // POS
  getPOSSessionsTool,
];
