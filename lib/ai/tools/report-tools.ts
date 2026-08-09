import { AITool } from "../types";
import {
  fetchProfitLossData,
  fetchBalanceSheetData,
  fetchCashFlowData,
  fetchEquityData,
  fetchRatiosData,
} from "@/app/[locale]/(dashboard)/accounting/reports/data";
import { getARAgingSummary } from "@/app/[locale]/(dashboard)/sales/reports/ar-aging/actions";
import { getReceivableReport } from "@/app/[locale]/(dashboard)/sales/reports/receivable/actions";
import { getCustomerRecapReport } from "@/app/[locale]/(dashboard)/sales/reports/customer-recap/actions";
import { getSalesByProductReport } from "@/app/[locale]/(dashboard)/sales/reports/sales-by-product/actions";
import { getProfitabilityReport } from "@/app/[locale]/(dashboard)/sales/reports/profitability/actions";
import { getAPAgingSummary } from "@/app/[locale]/(dashboard)/purchase/reports/ap-aging/actions";
import { getPayableReport } from "@/app/[locale]/(dashboard)/purchase/reports/payable/actions";
import { getVendorRecapReport } from "@/app/[locale]/(dashboard)/purchase/reports/vendor-recap/actions";
import {
  getCashBalanceReport,
  getCashFlowSummaryReport,
  getDailyCashMovementReport,
} from "@/app/[locale]/(dashboard)/cash-bank/reports/actions";
import {
  getStockValuationReport,
  getLowStockReport,
  getSlowMovingReport,
  getMovementSummaryReport,
} from "@/app/[locale]/(dashboard)/inventory/products/reports/actions";
import {
  getBudgetVarianceReport,
  getOverspendingReport,
} from "@/app/[locale]/(dashboard)/budgeting/reports/actions";
import {
  getAssetRegisterReport,
  getDepreciationSummaryReport,
  getAssetValuationReport,
} from "@/app/[locale]/(dashboard)/assets/reports/actions";
import {
  getProductionOutputReport,
  getMaterialConsumptionReport,
  getWipReport,
} from "@/app/[locale]/(dashboard)/production/reports/actions";
import { analyzeDataset, rowsToMarkdownTable } from "../analysis";
import { serializePrisma } from "@/lib/prisma";

function defaultDateRange(days = 30): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatAccountLines(
  lines: Array<{
    code: string;
    name: string;
    amount: number;
    level?: number;
    children?: any[];
  }>,
  indent = 0,
): string {
  let out = "";
  for (const line of lines) {
    const pad = "  ".repeat(indent);
    out += `${pad}- ${line.code} ${line.name}: ${Number(line.amount).toFixed(2)}\n`;
    if (line.children?.length) {
      out += formatAccountLines(line.children, indent + 1);
    }
  }
  return out;
}

function safeError(e: unknown): string {
  return `Error generating report: ${(e as Error).message}`;
}

function withAnalysis(
  title: string,
  tableMarkdown: string,
  rows: Record<string, unknown>[],
): string {
  const analysis = analyzeDataset(rows, { title: `${title} — Insights` });
  return `## ${title}\n\n${tableMarkdown}\n\n${analysis.markdown}`;
}

// ============================================================================
// STANDARD SYSTEM REPORTS (parity with native reporting modules)
// ============================================================================

export const listAvailableReportsTool: AITool = {
  name: "list_available_reports",
  description:
    "List all standard system reports the AI can generate, grouped by module. Use this when the user asks what reports are available.",
  parameters: { type: "object", properties: {} },
  handler: async () => {
    return [
      "## Available Standard Reports",
      "",
      "### Accounting",
      "- profit_loss — Profit & Loss / Income Statement",
      "- balance_sheet — Balance Sheet as of a date",
      "- cash_flow — Statement of Cash Flows",
      "- equity_change — Statement of Changes in Equity",
      "- financial_ratios — Liquidity, profitability, leverage ratios",
      "",
      "### Sales",
      "- ar_aging — Accounts Receivable aging summary",
      "- receivable — Outstanding receivables",
      "- customer_recap — Sales recap by customer",
      "- sales_by_product — Sales breakdown by product",
      "- profitability — Product/sales profitability",
      "",
      "### Purchasing",
      "- ap_aging — Accounts Payable aging summary",
      "- payable — Outstanding payables",
      "- vendor_recap — Purchase recap by vendor",
      "",
      "### Cash & Bank",
      "- cash_balance — Cash account balances for a period",
      "- cash_flow_summary — Cash flow summary report",
      "- daily_cash_movement — Daily cash in/out movement",
      "",
      "### Inventory",
      "- stock_valuation — Inventory stock valuation",
      "- low_stock — Low stock / reorder alerts",
      "- slow_moving — Slow-moving inventory",
      "- inventory_movement — Inventory movement summary",
      "",
      "### Budgeting",
      "- budget_variance — Budget vs actual variance",
      "- overspending — Overspending alerts",
      "",
      "### Assets",
      "- asset_register — Fixed asset register",
      "- depreciation_summary — Depreciation summary",
      "- asset_valuation — Asset book value report",
      "",
      "### Production",
      "- production_output — Production output / yield",
      "- material_consumption — Material consumption",
      "- wip — Work-in-progress report",
      "",
      "Use `run_standard_report` with the report code and optional dates.",
      "Authorized superadmin/Accountant users may also use custom SQL tools.",
    ].join("\n");
  },
};

export const runStandardReportTool: AITool = {
  name: "run_standard_report",
  description:
    "Run a standard system report by code (parity with native reporting UI). Codes: profit_loss, balance_sheet, cash_flow, equity_change, financial_ratios, ar_aging, receivable, customer_recap, sales_by_product, profitability, ap_aging, payable, vendor_recap, cash_balance, cash_flow_summary, daily_cash_movement, stock_valuation, low_stock, slow_moving, inventory_movement, budget_variance, overspending, asset_register, depreciation_summary, asset_valuation, production_output, material_consumption, wip. Provide startDate/endDate/asOfDate as YYYY-MM-DD when relevant.",
  parameters: {
    type: "object",
    properties: {
      reportCode: {
        type: "string",
        description: "Report code from list_available_reports",
      },
      startDate: {
        type: "string",
        description: "Period start date YYYY-MM-DD",
      },
      endDate: {
        type: "string",
        description: "Period end date YYYY-MM-DD",
      },
      asOfDate: {
        type: "string",
        description: "As-of date YYYY-MM-DD for point-in-time reports",
      },
      includeAnalysis: {
        type: "boolean",
        description: "Include trend/anomaly insights (default true)",
      },
    },
    required: ["reportCode"],
  },
  handler: async ({
    reportCode,
    startDate,
    endDate,
    asOfDate,
    includeAnalysis = true,
  }: {
    reportCode: string;
    startDate?: string;
    endDate?: string;
    asOfDate?: string;
    includeAnalysis?: boolean;
  }) => {
    try {
      const range = defaultDateRange(30);
      const start = startDate || range.startDate;
      const end = endDate || range.endDate;
      const asOf = asOfDate || end || todayISO();
      const code = reportCode.toLowerCase().trim();

      switch (code) {
        case "profit_loss": {
          const data = await fetchProfitLossData({ startDate: start, endDate: end });
          let md = `## Profit & Loss (${start} → ${end})\n\n`;
          md += `**Total Revenue:** ${data.totalRevenue.toFixed(2)}\n`;
          md += `**Total Expenses:** ${data.totalExpenses.toFixed(2)}\n`;
          md += `**Net Income:** ${data.netIncome.toFixed(2)}\n\n`;
          md += `### Revenue\n${formatAccountLines(data.revenue)}\n`;
          md += `### Expenses\n${formatAccountLines(data.expenses)}\n`;
          if (includeAnalysis) {
            md +=
              "\n" +
              analyzeDataset(
                [
                  {
                    totalRevenue: data.totalRevenue,
                    totalExpenses: data.totalExpenses,
                    netIncome: data.netIncome,
                  },
                ],
                { title: "P&L Insights" },
              ).markdown;
          }
          return md;
        }
        case "balance_sheet": {
          const data = await fetchBalanceSheetData({ date: asOf });
          let md = `## Balance Sheet (as of ${asOf})\n\n`;
          md += `**Total Assets:** ${data.totalAssets.toFixed(2)}\n`;
          md += `**Total Liabilities:** ${data.totalLiabilities.toFixed(2)}\n`;
          md += `**Total Equity:** ${data.totalEquity.toFixed(2)}\n`;
          md += `**Liabilities + Equity:** ${data.totalLiabilitiesAndEquity.toFixed(2)}\n\n`;
          md += `### Assets\n${formatAccountLines(data.assets)}\n`;
          md += `### Liabilities\n${formatAccountLines(data.liabilities)}\n`;
          md += `### Equity\n${formatAccountLines(data.equity)}\n`;
          if (includeAnalysis) {
            const balanced =
              Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity) < 0.01;
            md +=
              "\n" +
              analyzeDataset(
                [
                  {
                    totalAssets: data.totalAssets,
                    totalLiabilities: data.totalLiabilities,
                    totalEquity: data.totalEquity,
                    balanced: balanced ? 1 : 0,
                  },
                ],
                { title: "Balance Sheet Insights" },
              ).markdown;
            if (!balanced) {
              md +=
                "\n- ⚠ **ANOMALY** (critical): Balance sheet does not balance — investigate unposted or misclassified entries.";
            }
          }
          return md;
        }
        case "cash_flow": {
          const data = await fetchCashFlowData({ startDate: start, endDate: end });
          let md = `## Cash Flow Statement (${start} → ${end})\n\n`;
          md += `- Operating: ${data.netCashProvidedByOperating.toFixed(2)}\n`;
          md += `- Investing: ${data.netCashProvidedByInvesting.toFixed(2)}\n`;
          md += `- Financing: ${data.netCashProvidedByFinancing.toFixed(2)}\n`;
          md += `- Net increase: ${data.netIncreaseInCash.toFixed(2)}\n`;
          md += `- Cash beginning: ${data.cashAtBeginning.toFixed(2)}\n`;
          md += `- Cash ending: ${data.cashAtEnd.toFixed(2)}\n`;
          if (includeAnalysis) {
            md +=
              "\n" +
              analyzeDataset(
                [
                  {
                    operating: data.netCashProvidedByOperating,
                    investing: data.netCashProvidedByInvesting,
                    financing: data.netCashProvidedByFinancing,
                    netIncrease: data.netIncreaseInCash,
                  },
                ],
                { title: "Cash Flow Insights" },
              ).markdown;
          }
          return md;
        }
        case "equity_change": {
          const data = await fetchEquityData({ startDate: start, endDate: end });
          const rows = (data.items || []).map((i: any) => serializePrisma(i));
          const table = rowsToMarkdownTable(rows as Record<string, unknown>[]);
          return includeAnalysis
            ? withAnalysis(
                `Changes in Equity (${start} → ${end})`,
                table,
                rows as Record<string, unknown>[],
              )
            : `## Changes in Equity\n\n${table}`;
        }
        case "financial_ratios": {
          const data = await fetchRatiosData({ date: asOf });
          const flat = serializePrisma(data) as Record<string, unknown>;
          const rows = [flat];
          const table = rowsToMarkdownTable(rows);
          return includeAnalysis
            ? withAnalysis(`Financial Ratios (as of ${asOf})`, table, rows)
            : `## Financial Ratios\n\n${table}`;
        }
        case "ar_aging": {
          const data = await getARAgingSummary(new Date(asOf));
          const rows = serializePrisma(data) as Record<string, unknown>[];
          const table = rowsToMarkdownTable(rows);
          return includeAnalysis
            ? withAnalysis(`AR Aging Summary (as of ${asOf})`, table, rows)
            : `## AR Aging\n\n${table}`;
        }
        case "receivable": {
          const data = await getReceivableReport(new Date(start), new Date(end));
          const rows = serializePrisma(data) as Record<string, unknown>[];
          const table = rowsToMarkdownTable(rows);
          return includeAnalysis
            ? withAnalysis(`Receivables (${start} → ${end})`, table, rows)
            : `## Receivables\n\n${table}`;
        }
        case "customer_recap": {
          const data = await getCustomerRecapReport(
            new Date(start),
            new Date(end),
          );
          const rows = serializePrisma(data) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `Customer Recap (${start} → ${end})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "sales_by_product": {
          const data = await getSalesByProductReport(
            new Date(start),
            new Date(end),
          );
          const rows = serializePrisma(data) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `Sales by Product (${start} → ${end})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "profitability": {
          const data = await getProfitabilityReport(
            new Date(start),
            new Date(end),
          );
          const rows = serializePrisma(data) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `Profitability (${start} → ${end})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "ap_aging": {
          const data = await getAPAgingSummary(new Date(asOf));
          const rows = serializePrisma(data) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `AP Aging Summary (as of ${asOf})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "payable": {
          const data = await getPayableReport(new Date(start), new Date(end));
          const rows = serializePrisma(data) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `Payables (${start} → ${end})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "vendor_recap": {
          const data = await getVendorRecapReport(
            new Date(start),
            new Date(end),
          );
          const rows = serializePrisma(data) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `Vendor Recap (${start} → ${end})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "cash_balance": {
          const data = await getCashBalanceReport(new Date(start), new Date(end));
          const rows = serializePrisma(data.entries || []) as Record<
            string,
            unknown
          >[];
          let md = `## Cash Balance (${start} → ${end})\n\n`;
          if (data.totals) {
            md += `Totals — Beginning: ${data.totals.beginningBalance}, In: ${data.totals.totalIn}, Out: ${data.totals.totalOut}, Ending: ${data.totals.endingBalance}\n\n`;
          }
          md += rowsToMarkdownTable(rows);
          if (includeAnalysis) {
            md += "\n\n" + analyzeDataset(rows, { title: "Cash Balance Insights" }).markdown;
          }
          return md;
        }
        case "cash_flow_summary": {
          const data = await getCashFlowSummaryReport(
            new Date(start),
            new Date(end),
          );
          const rows = serializePrisma(
            (data as any).points ||
              (data as any).entries ||
              (Array.isArray(data) ? data : [data]),
          ) as Record<string, unknown>[];
          let md = `## Cash Flow Summary (${start} → ${end})\n\n`;
          if ((data as any).totals) {
            const t = (data as any).totals;
            md += `Totals — In: ${t.cashIn}, Out: ${t.cashOut}, Net: ${t.net}\n\n`;
          }
          md += rowsToMarkdownTable(rows);
          if (includeAnalysis) {
            md +=
              "\n\n" +
              analyzeDataset(rows, { title: "Cash Flow Summary Insights" })
                .markdown;
          }
          return md;
        }
        case "daily_cash_movement": {
          const data = await getDailyCashMovementReport(
            new Date(start),
            new Date(end),
          );
          const rows = serializePrisma(
            (data as any).entries ||
              (Array.isArray(data) ? data : [data]),
          ) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `Daily Cash Movement (${start} → ${end})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "stock_valuation": {
          const data = await getStockValuationReport();
          const rows = serializePrisma(
            Array.isArray(data) ? data : (data as any).entries || [data],
          ) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis("Stock Valuation", rowsToMarkdownTable(rows), rows)
            : rowsToMarkdownTable(rows);
        }
        case "low_stock": {
          const data = await getLowStockReport();
          const rows = serializePrisma(
            Array.isArray(data) ? data : (data as any).entries || [data],
          ) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis("Low Stock Alert", rowsToMarkdownTable(rows), rows)
            : rowsToMarkdownTable(rows);
        }
        case "slow_moving": {
          const data = await getSlowMovingReport(new Date(asOf));
          const rows = serializePrisma(data) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis("Slow Moving Inventory", rowsToMarkdownTable(rows), rows)
            : rowsToMarkdownTable(rows);
        }
        case "inventory_movement": {
          const data = await getMovementSummaryReport(
            new Date(start),
            new Date(end),
          );
          const rows = serializePrisma(data) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `Inventory Movement (${start} → ${end})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "budget_variance": {
          const fiscalYear = new Date(end).getFullYear();
          const data = await getBudgetVarianceReport({ fiscalYear });
          const rows = serializePrisma(data) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `Budget Variance (FY ${fiscalYear})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "overspending": {
          const fiscalYear = new Date(end).getFullYear();
          const data = await getOverspendingReport({ fiscalYear });
          const rows = serializePrisma(data) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis("Overspending Report", rowsToMarkdownTable(rows), rows)
            : rowsToMarkdownTable(rows);
        }
        case "asset_register": {
          const data = await getAssetRegisterReport();
          const rows = serializePrisma(
            Array.isArray(data) ? data : (data as any).entries || [data],
          ) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis("Asset Register", rowsToMarkdownTable(rows), rows)
            : rowsToMarkdownTable(rows);
        }
        case "depreciation_summary": {
          const data = await getDepreciationSummaryReport();
          const rows = serializePrisma(
            Array.isArray(data) ? data : (data as any).entries || [data],
          ) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis("Depreciation Summary", rowsToMarkdownTable(rows), rows)
            : rowsToMarkdownTable(rows);
        }
        case "asset_valuation": {
          const data = await getAssetValuationReport();
          const rows = serializePrisma(
            Array.isArray(data) ? data : (data as any).entries || [data],
          ) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis("Asset Valuation", rowsToMarkdownTable(rows), rows)
            : rowsToMarkdownTable(rows);
        }
        case "production_output": {
          const data = await getProductionOutputReport(
            new Date(start),
            new Date(end),
          );
          const rows = serializePrisma(
            Array.isArray(data) ? data : (data as any).entries || [data],
          ) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `Production Output (${start} → ${end})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "material_consumption": {
          const data = await getMaterialConsumptionReport(
            new Date(start),
            new Date(end),
          );
          const rows = serializePrisma(
            Array.isArray(data) ? data : (data as any).entries || [data],
          ) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis(
                `Material Consumption (${start} → ${end})`,
                rowsToMarkdownTable(rows),
                rows,
              )
            : rowsToMarkdownTable(rows);
        }
        case "wip": {
          const data = await getWipReport();
          const rows = serializePrisma(
            Array.isArray(data) ? data : (data as any).entries || [data],
          ) as Record<string, unknown>[];
          return includeAnalysis
            ? withAnalysis("Work in Progress", rowsToMarkdownTable(rows), rows)
            : rowsToMarkdownTable(rows);
        }
        default:
          return `Unknown report code "${reportCode}". Call list_available_reports for valid codes.`;
      }
    } catch (e) {
      return safeError(e);
    }
  },
};

export const standardReportTools: AITool[] = [
  listAvailableReportsTool,
  runStandardReportTool,
];
