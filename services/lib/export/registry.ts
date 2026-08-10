import type { ExportColumn } from "./types";

export type ExportJobId =
  | "sales.ar_aging.summary"
  | "sales.ar_aging.detail"
  | "purchase.ap_aging.summary"
  | "purchase.ap_aging.detail"
  | "sales.receivable"
  | "purchase.payable"
  | "inventory.stock_valuation"
  | "inventory.low_stock"
  | "inventory.slow_moving"
  | "inventory.movement_summary"
  | "inventory.product_margin"
  | "sales.sales_by_product"
  | "sales.customer_recap"
  | "sales.profitability"
  | "purchase.vendor_recap"
  | "purchase.purchase_by_product"
  | "accounting.trial_balance";

export type ExportJobContext = {
  asOfDate?: string;
  startDate?: string;
  endDate?: string;
  warehouseId?: string;
  categoryId?: string;
  date?: string;
  inactiveDays?: number | string;
  [key: string]: unknown;
};

export type ExportJobDefinition = {
  id: ExportJobId;
  /** Permission required to run this export */
  permission: string;
  /** Default filename prefix (date suffix added by caller) */
  filename: (ctx: ExportJobContext) => string;
  sheetName: string;
  columns: ExportColumn[];
  fetchRows: (ctx: ExportJobContext) => Promise<Record<string, unknown>[]>;
};

function formatDateCell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

/**
 * Server-side export jobs: rows are fetched on the server so the client
 * never ships large datasets over the wire.
 */
export const EXPORT_JOBS: Record<ExportJobId, ExportJobDefinition> = {
  "sales.ar_aging.summary": {
    id: "sales.ar_aging.summary",
    permission: "sales.view",
    filename: (ctx) => `ar-aging-summary-${ctx.asOfDate ?? "today"}`,
    sheetName: "AR Aging Summary",
    columns: [
      { key: "contactName", header: "Customer" },
      { key: "invoiceCount", header: "Invoices" },
      { key: "current", header: "Current" },
      { key: "bucket1", header: "1-30" },
      { key: "bucket2", header: "31-60" },
      { key: "bucket3", header: "61-90" },
      { key: "bucket4", header: "90+" },
      { key: "totalOutstanding", header: "Total Outstanding" },
    ],
    fetchRows: async (ctx) => {
      const { getARAgingSummary } = await import(
        "@/app/[locale]/(dashboard)/sales/reports/ar-aging/actions"
      );
      const asOf = ctx.asOfDate ? new Date(ctx.asOfDate) : new Date();
      const rows = await getARAgingSummary(asOf);
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "sales.ar_aging.detail": {
    id: "sales.ar_aging.detail",
    permission: "sales.view",
    filename: (ctx) => `ar-aging-detail-${ctx.asOfDate ?? "today"}`,
    sheetName: "AR Aging Detail",
    columns: [
      { key: "contactName", header: "Customer" },
      { key: "invoiceNumber", header: "Invoice #" },
      { key: "invoiceDate", header: "Invoice Date" },
      { key: "dueDate", header: "Due Date" },
      { key: "totalAmount", header: "Total" },
      { key: "paidAmount", header: "Paid" },
      { key: "balance", header: "Balance" },
      { key: "daysOverdue", header: "Days Overdue" },
      { key: "bucket", header: "Bucket" },
    ],
    fetchRows: async (ctx) => {
      const { getARAgingDetail } = await import(
        "@/app/[locale]/(dashboard)/sales/reports/ar-aging/actions"
      );
      const asOf = ctx.asOfDate ? new Date(ctx.asOfDate) : new Date();
      const rows = await getARAgingDetail(asOf);
      return rows.map((r) => ({
        ...r,
        invoiceDate: formatDateCell(r.invoiceDate),
        dueDate: formatDateCell(r.dueDate),
      })) as unknown as Record<string, unknown>[];
    },
  },
  "purchase.ap_aging.summary": {
    id: "purchase.ap_aging.summary",
    permission: "purchase.view",
    filename: (ctx) => `ap-aging-summary-${ctx.asOfDate ?? "today"}`,
    sheetName: "AP Aging Summary",
    columns: [
      { key: "contactName", header: "Vendor" },
      { key: "invoiceCount", header: "Invoices" },
      { key: "current", header: "Current" },
      { key: "bucket1", header: "1-30" },
      { key: "bucket2", header: "31-60" },
      { key: "bucket3", header: "61-90" },
      { key: "bucket4", header: "90+" },
      { key: "totalOutstanding", header: "Total Outstanding" },
    ],
    fetchRows: async (ctx) => {
      const { getAPAgingSummary } = await import(
        "@/app/[locale]/(dashboard)/purchase/reports/ap-aging/actions"
      );
      const asOf = ctx.asOfDate ? new Date(ctx.asOfDate) : new Date();
      const rows = await getAPAgingSummary(asOf);
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "purchase.ap_aging.detail": {
    id: "purchase.ap_aging.detail",
    permission: "purchase.view",
    filename: (ctx) => `ap-aging-detail-${ctx.asOfDate ?? "today"}`,
    sheetName: "AP Aging Detail",
    columns: [
      { key: "contactName", header: "Vendor" },
      { key: "invoiceNumber", header: "Invoice #" },
      { key: "invoiceDate", header: "Invoice Date" },
      { key: "dueDate", header: "Due Date" },
      { key: "totalAmount", header: "Total" },
      { key: "paidAmount", header: "Paid" },
      { key: "balance", header: "Balance" },
      { key: "daysOverdue", header: "Days Overdue" },
      { key: "bucket", header: "Bucket" },
    ],
    fetchRows: async (ctx) => {
      const { getAPAgingDetail } = await import(
        "@/app/[locale]/(dashboard)/purchase/reports/ap-aging/actions"
      );
      const asOf = ctx.asOfDate ? new Date(ctx.asOfDate) : new Date();
      const rows = await getAPAgingDetail(asOf);
      return rows.map((r) => ({
        ...r,
        invoiceDate: formatDateCell(r.invoiceDate),
        dueDate: formatDateCell(r.dueDate),
      })) as unknown as Record<string, unknown>[];
    },
  },
  "sales.receivable": {
    id: "sales.receivable",
    permission: "sales.view",
    filename: (ctx) =>
      `sales-receivable-${ctx.startDate ?? "start"}-${ctx.endDate ?? "end"}`,
    sheetName: "Receivable",
    columns: [
      { key: "contactName", header: "Customer" },
      { key: "openingBalance", header: "Opening Balance" },
      { key: "invoiceAmount", header: "Invoices" },
      { key: "returnAmount", header: "Returns" },
      { key: "paymentAmount", header: "Payments" },
      { key: "closingBalance", header: "Closing Balance" },
    ],
    fetchRows: async (ctx) => {
      const { getReceivableReport } = await import(
        "@/app/[locale]/(dashboard)/sales/reports/receivable/actions"
      );
      const start = ctx.startDate ? new Date(ctx.startDate) : new Date();
      const end = ctx.endDate ? new Date(ctx.endDate) : new Date();
      const rows = await getReceivableReport(start, end);
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "purchase.payable": {
    id: "purchase.payable",
    permission: "purchase.view",
    filename: (ctx) =>
      `purchase-payable-${ctx.startDate ?? "start"}-${ctx.endDate ?? "end"}`,
    sheetName: "Payable",
    columns: [
      { key: "contactName", header: "Vendor" },
      { key: "openingBalance", header: "Opening Balance" },
      { key: "invoiceAmount", header: "Invoices" },
      { key: "returnAmount", header: "Returns" },
      { key: "paymentAmount", header: "Payments" },
      { key: "closingBalance", header: "Closing Balance" },
    ],
    fetchRows: async (ctx) => {
      const { getPayableReport } = await import(
        "@/app/[locale]/(dashboard)/purchase/reports/payable/actions"
      );
      const start = ctx.startDate ? new Date(ctx.startDate) : new Date();
      const end = ctx.endDate ? new Date(ctx.endDate) : new Date();
      const rows = await getPayableReport(start, end);
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "inventory.stock_valuation": {
    id: "inventory.stock_valuation",
    permission: "inventory.view",
    filename: () => `stock-valuation`,
    sheetName: "Stock Valuation",
    columns: [
      { key: "productSku", header: "SKU" },
      { key: "productName", header: "Product" },
      { key: "categoryName", header: "Category" },
      { key: "unitSymbol", header: "Unit" },
      { key: "quantity", header: "Qty" },
      { key: "unitCost", header: "Unit Cost" },
      { key: "totalValue", header: "Total Value" },
      { key: "sellingPrice", header: "Selling Price" },
      { key: "potentialRevenue", header: "Potential Revenue" },
    ],
    fetchRows: async (ctx) => {
      const { getStockValuationReport } = await import(
        "@/app/[locale]/(dashboard)/inventory/products/reports/actions"
      );
      const rows = await getStockValuationReport({
        warehouseId:
          ctx.warehouseId && ctx.warehouseId !== "ALL"
            ? String(ctx.warehouseId)
            : undefined,
        categoryId:
          ctx.categoryId && ctx.categoryId !== "ALL"
            ? String(ctx.categoryId)
            : undefined,
      });
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "inventory.low_stock": {
    id: "inventory.low_stock",
    permission: "inventory.view",
    filename: () => `low-stock`,
    sheetName: "Low Stock",
    columns: [
      { key: "status", header: "Status" },
      { key: "productSku", header: "SKU" },
      { key: "productName", header: "Product" },
      { key: "warehouseName", header: "Warehouse" },
      { key: "quantity", header: "Qty" },
      { key: "availableQty", header: "Available" },
      { key: "reorderPoint", header: "Reorder Point" },
      { key: "minStock", header: "Min Stock" },
      { key: "deficit", header: "Deficit" },
    ],
    fetchRows: async (ctx) => {
      const { getLowStockReport } = await import(
        "@/app/[locale]/(dashboard)/inventory/products/reports/actions"
      );
      const rows = await getLowStockReport({
        warehouseId:
          ctx.warehouseId && ctx.warehouseId !== "ALL"
            ? String(ctx.warehouseId)
            : undefined,
      });
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "inventory.slow_moving": {
    id: "inventory.slow_moving",
    permission: "inventory.view",
    filename: (ctx) => `slow-moving-${ctx.asOfDate ?? "today"}`,
    sheetName: "Slow Moving",
    columns: [
      { key: "status", header: "Status" },
      { key: "productSku", header: "SKU" },
      { key: "productName", header: "Product" },
      { key: "categoryName", header: "Category" },
      { key: "quantity", header: "Qty" },
      { key: "stockValue", header: "Stock Value" },
      { key: "daysSinceMovement", header: "Days Idle" },
      { key: "lastMovementDate", header: "Last Movement" },
      { key: "movementCountInPeriod", header: "Movements" },
    ],
    fetchRows: async (ctx) => {
      const { getSlowMovingReport } = await import(
        "@/app/[locale]/(dashboard)/inventory/products/reports/actions"
      );
      const asOf = ctx.asOfDate ? new Date(ctx.asOfDate) : new Date();
      const inactiveDays = Number(ctx.inactiveDays) || 90;
      const rows = await getSlowMovingReport(asOf, inactiveDays);
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "inventory.movement_summary": {
    id: "inventory.movement_summary",
    permission: "inventory.view",
    filename: (ctx) =>
      `movement-summary-${ctx.startDate ?? "start"}-${ctx.endDate ?? "end"}`,
    sheetName: "Movement Summary",
    columns: [
      { key: "productSku", header: "SKU" },
      { key: "productName", header: "Product" },
      { key: "categoryName", header: "Category" },
      { key: "qtyIn", header: "Qty In" },
      { key: "qtyOut", header: "Qty Out" },
      { key: "qtyTransfer", header: "Transfer" },
      { key: "qtyAdjustment", header: "Adjustment" },
      { key: "qtyProductionIn", header: "Prod In" },
      { key: "qtyProductionOut", header: "Prod Out" },
      { key: "netChange", header: "Net Change" },
      { key: "totalCostIn", header: "Cost In" },
      { key: "totalCostOut", header: "Cost Out" },
    ],
    fetchRows: async (ctx) => {
      const { getMovementSummaryReport } = await import(
        "@/app/[locale]/(dashboard)/inventory/products/reports/actions"
      );
      const start = ctx.startDate ? new Date(ctx.startDate) : new Date();
      const end = ctx.endDate ? new Date(ctx.endDate) : new Date();
      const rows = await getMovementSummaryReport(start, end, {
        warehouseId:
          ctx.warehouseId && ctx.warehouseId !== "ALL"
            ? String(ctx.warehouseId)
            : undefined,
        categoryId:
          ctx.categoryId && ctx.categoryId !== "ALL"
            ? String(ctx.categoryId)
            : undefined,
      });
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "inventory.product_margin": {
    id: "inventory.product_margin",
    permission: "inventory.view",
    filename: () => `product-margin`,
    sheetName: "Product Margin",
    columns: [
      { key: "productSku", header: "SKU" },
      { key: "productName", header: "Product" },
      { key: "categoryName", header: "Category" },
      { key: "cost", header: "Cost" },
      { key: "averageCost", header: "Avg Cost" },
      { key: "sellingPrice", header: "Selling Price" },
      { key: "marginAmount", header: "Margin Amount" },
      { key: "marginPct", header: "Margin %" },
      { key: "stockQty", header: "Qty" },
      { key: "stockValue", header: "Stock Value" },
    ],
    fetchRows: async (ctx) => {
      const { getProductMarginReport } = await import(
        "@/app/[locale]/(dashboard)/inventory/products/reports/actions"
      );
      const rows = await getProductMarginReport({
        categoryId:
          ctx.categoryId && ctx.categoryId !== "ALL"
            ? String(ctx.categoryId)
            : undefined,
        activeOnly: true,
      });
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "sales.sales_by_product": {
    id: "sales.sales_by_product",
    permission: "sales.view",
    filename: (ctx) =>
      `sales-by-product-${ctx.startDate ?? "start"}-${ctx.endDate ?? "end"}`,
    sheetName: "Sales by Product",
    columns: [
      { key: "productSku", header: "SKU" },
      { key: "productName", header: "Product" },
      { key: "categoryName", header: "Category" },
      { key: "quantitySold", header: "Qty Sold" },
      { key: "grossAmount", header: "Gross" },
      { key: "discountAmount", header: "Discount" },
      { key: "taxAmount", header: "Tax" },
      { key: "netAmount", header: "Net" },
    ],
    fetchRows: async (ctx) => {
      const { getSalesByProductReport } = await import(
        "@/app/[locale]/(dashboard)/sales/reports/sales-by-product/actions"
      );
      const start = ctx.startDate ? new Date(ctx.startDate) : new Date();
      const end = ctx.endDate ? new Date(ctx.endDate) : new Date();
      const rows = await getSalesByProductReport(start, end);
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "sales.customer_recap": {
    id: "sales.customer_recap",
    permission: "sales.view",
    filename: (ctx) =>
      `sales-customer-recap-${ctx.startDate ?? "start"}-${ctx.endDate ?? "end"}`,
    sheetName: "Customer Recap",
    columns: [
      { key: "contactName", header: "Customer" },
      { key: "invoiceCount", header: "Invoices" },
      { key: "totalInvoiceAmount", header: "Invoice Amount" },
      { key: "totalReturnAmount", header: "Returns" },
      { key: "totalPaymentAmount", header: "Payments" },
      { key: "netSales", header: "Net Sales" },
      { key: "outstanding", header: "Outstanding" },
    ],
    fetchRows: async (ctx) => {
      const { getCustomerRecapReport } = await import(
        "@/app/[locale]/(dashboard)/sales/reports/customer-recap/actions"
      );
      const start = ctx.startDate ? new Date(ctx.startDate) : new Date();
      const end = ctx.endDate ? new Date(ctx.endDate) : new Date();
      const rows = await getCustomerRecapReport(start, end);
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "sales.profitability": {
    id: "sales.profitability",
    permission: "sales.view",
    filename: (ctx) =>
      `sales-profitability-${ctx.startDate ?? "start"}-${ctx.endDate ?? "end"}`,
    sheetName: "Profitability",
    columns: [
      { key: "productSku", header: "SKU" },
      { key: "productName", header: "Product" },
      { key: "categoryName", header: "Category" },
      { key: "quantitySold", header: "Qty Sold" },
      { key: "revenue", header: "Revenue" },
      { key: "cogs", header: "COGS" },
      { key: "grossProfit", header: "Gross Profit" },
      { key: "marginPct", header: "Margin %" },
    ],
    fetchRows: async (ctx) => {
      const { getProfitabilityReport } = await import(
        "@/app/[locale]/(dashboard)/sales/reports/profitability/actions"
      );
      const start = ctx.startDate ? new Date(ctx.startDate) : new Date();
      const end = ctx.endDate ? new Date(ctx.endDate) : new Date();
      const rows = await getProfitabilityReport(start, end);
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "purchase.vendor_recap": {
    id: "purchase.vendor_recap",
    permission: "purchase.view",
    filename: (ctx) =>
      `purchase-vendor-recap-${ctx.startDate ?? "start"}-${ctx.endDate ?? "end"}`,
    sheetName: "Vendor Recap",
    columns: [
      { key: "contactName", header: "Vendor" },
      { key: "invoiceCount", header: "Invoices" },
      { key: "totalInvoiceAmount", header: "Invoice Amount" },
      { key: "totalReturnAmount", header: "Returns" },
      { key: "totalPaymentAmount", header: "Payments" },
      { key: "netPurchases", header: "Net Purchases" },
      { key: "outstanding", header: "Outstanding" },
    ],
    fetchRows: async (ctx) => {
      const { getVendorRecapReport } = await import(
        "@/app/[locale]/(dashboard)/purchase/reports/vendor-recap/actions"
      );
      const start = ctx.startDate ? new Date(ctx.startDate) : new Date();
      const end = ctx.endDate ? new Date(ctx.endDate) : new Date();
      const rows = await getVendorRecapReport(start, end);
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "purchase.purchase_by_product": {
    id: "purchase.purchase_by_product",
    permission: "purchase.view",
    filename: (ctx) =>
      `purchase-by-product-${ctx.startDate ?? "start"}-${ctx.endDate ?? "end"}`,
    sheetName: "Purchase by Product",
    columns: [
      { key: "productSku", header: "SKU" },
      { key: "productName", header: "Product" },
      { key: "categoryName", header: "Category" },
      { key: "quantityOrdered", header: "Qty Ordered" },
      { key: "quantityReceived", header: "Qty Received" },
      { key: "grossCost", header: "Gross Cost" },
      { key: "avgUnitCost", header: "Avg Cost" },
      { key: "orderCount", header: "Orders" },
    ],
    fetchRows: async (ctx) => {
      const { getPurchaseByProductReport } = await import(
        "@/app/[locale]/(dashboard)/purchase/reports/purchase-by-product/actions"
      );
      const start = ctx.startDate ? new Date(ctx.startDate) : new Date();
      const end = ctx.endDate ? new Date(ctx.endDate) : new Date();
      const rows = await getPurchaseByProductReport(start, end);
      return rows as unknown as Record<string, unknown>[];
    },
  },
  "accounting.trial_balance": {
    id: "accounting.trial_balance",
    permission: "reports.view",
    filename: (ctx) => `trial-balance-${ctx.date ?? "today"}`,
    sheetName: "Trial Balance",
    columns: [
      { key: "code", header: "Code" },
      { key: "name", header: "Account" },
      { key: "type", header: "Type" },
      { key: "debit", header: "Debit" },
      { key: "credit", header: "Credit" },
      { key: "level", header: "Level" },
    ],
    fetchRows: async (ctx) => {
      const { getTrialBalance } = await import(
        "@/app/[locale]/(dashboard)/accounting/trial-balance/actions"
      );
      const date = ctx.date ?? new Date().toISOString().slice(0, 10);
      const res = await getTrialBalance(date);
      if (!res.success || !res.data) {
        const message =
          !res.success && "error" in res
            ? res.error
            : "Failed to load trial balance";
        throw new Error(message);
      }
      return res.data.items as unknown as Record<string, unknown>[];
    },
  },
};

export function getExportJob(id: string): ExportJobDefinition | null {
  return (EXPORT_JOBS as Record<string, ExportJobDefinition>)[id] ?? null;
}
