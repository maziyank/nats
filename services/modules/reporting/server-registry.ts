import { getSalesOrderData } from "@/app/[locale]/(dashboard)/sales/_reports/sales-order/data";
import { getPurchaseOrderData } from "@/app/[locale]/(dashboard)/purchase/_reports/purchase-order/data";
import { getSalesInvoiceData } from "@/app/[locale]/(dashboard)/sales/_reports/sales-invoice/data";
import { getJournalEntryData } from "@/app/[locale]/(dashboard)/accounting/_reports/journal-entry/data";
import { getPOSReceiptData } from "@/app/[locale]/pos/_reports/receipt/data";
import {
  fetchProfitLossData,
  fetchBalanceSheetData,
  fetchCashFlowData,
  fetchEquityData,
  fetchRatiosData,
} from "@/app/[locale]/(dashboard)/accounting/reports/data";
import { fetchBudgetTrackingData } from "@/app/[locale]/(dashboard)/budgeting/_reports/budget-tracking/data";

export const serverRegistry = {
  SALES_ORDER: { fetchData: getSalesOrderData },
  PURCHASE_ORDER: { fetchData: getPurchaseOrderData },
  SALES_INVOICE: { fetchData: getSalesInvoiceData },
  JOURNAL_ENTRY: { fetchData: getJournalEntryData },
  POS_RECEIPT: { fetchData: getPOSReceiptData },
  PROFIT_LOSS: { fetchData: fetchProfitLossData },
  BALANCE_SHEET: { fetchData: fetchBalanceSheetData },
  CASH_FLOW: { fetchData: fetchCashFlowData },
  EQUITY_CHANGE: { fetchData: fetchEquityData },
  FINANCIAL_RATIOS: { fetchData: fetchRatiosData },
  BUDGET_TRACKING: { fetchData: fetchBudgetTrackingData },
} as const;

export type ReportCode = keyof typeof serverRegistry;

