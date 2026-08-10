import { handleSalesInvoiceIssued } from "./sales-invoice-issued";
import {
  handleCashTransactionApprovedAccounting,
  handleCashTransactionApprovedCashBank,
} from "./cash-transaction-approved";
import {
  handleCashTransferApprovedAccounting,
  handleCashTransferApprovedCashBank,
} from "./cash-transfer-approved";
import {
  handleCashTransactionCreateRequestedAccounting,
  handleCashTransactionCreateRequestedCashBank,
} from "./cash-transaction-create-requested";
import { handlePurchaseInvoiceBilled } from "./purchase-invoice-billed";
import {
  handlePurchasePaymentPostedAccounting,
  handlePurchasePaymentPostedCashBank,
} from "./purchase-payment-posted";
import {
  handleSalesPaymentPostedAccounting,
  handleSalesPaymentPostedCashBank,
} from "./sales-payment-posted";
import { salesOrderCreatedHandler } from "./sales-order-created";
import { salesInvoiceCreatedHandler } from "./sales-invoice-created";
import { salesPaymentCreatedHandler } from "./sales-payment-created";
import { salesReturnCreatedHandler } from "./sales-return-created";
import { salesShipmentCreatedHandler } from "./sales-shipment-created";
import { purchaseOrderCreatedHandler } from "./purchase-order-created";
import { purchaseInvoiceCreatedHandler } from "./purchase-invoice-created";
import { purchasePaymentCreatedHandler } from "./purchase-payment-created";
import { purchaseReceiveCreatedHandler } from "./purchase-receive-created";
import { purchaseReturnCreatedHandler } from "./purchase-return-created";
import {
  handleInventoryMovementCreated,
  handleProductCreated,
} from "./inventory-handlers";
import {
  handlePayrollRunCompleted,
  handleSalarySlipPublished,
} from "./payroll.handlers";
import { handleJournalEntryPostedAccounting } from "./journal-entry-posted";

export const integrationHandlers = {
  SALES_INVOICE_ISSUED: [
    {
      consumer: "accounting",
      handle: handleSalesInvoiceIssued,
    },
  ],
  PURCHASE_INVOICE_BILLED: [
    {
      consumer: "accounting",
      handle: handlePurchaseInvoiceBilled,
    },
  ],
  SALES_PAYMENT_POSTED: [
    {
      consumer: "accounting",
      handle: handleSalesPaymentPostedAccounting,
    },
    {
      consumer: "cash_bank",
      handle: handleSalesPaymentPostedCashBank,
    },
  ],
  PURCHASE_PAYMENT_POSTED: [
    {
      consumer: "accounting",
      handle: handlePurchasePaymentPostedAccounting,
    },
    {
      consumer: "cash_bank",
      handle: handlePurchasePaymentPostedCashBank,
    },
  ],
  CASH_TRANSACTION_APPROVED: [
    {
      consumer: "accounting",
      handle: handleCashTransactionApprovedAccounting,
    },
    {
      consumer: "cash_bank",
      handle: handleCashTransactionApprovedCashBank,
    },
  ],
  CASH_TRANSFER_APPROVED: [
    {
      consumer: "accounting",
      handle: handleCashTransferApprovedAccounting,
    },
    {
      consumer: "cash_bank",
      handle: handleCashTransferApprovedCashBank,
    },
  ],
  CASH_TRANSACTION_CREATE_REQUESTED: [
    {
      consumer: "accounting",
      handle: handleCashTransactionCreateRequestedAccounting,
    },
    {
      consumer: "cash_bank",
      handle: handleCashTransactionCreateRequestedCashBank,
    },
  ],
  SALES_ORDER_CREATED: [salesOrderCreatedHandler],
  SALES_INVOICE_CREATED: [salesInvoiceCreatedHandler],
  SALES_PAYMENT_CREATED: [salesPaymentCreatedHandler],
  SALES_RETURN_CREATED: [salesReturnCreatedHandler],
  SALES_SHIPMENT_CREATED: [salesShipmentCreatedHandler],
  PURCHASE_ORDER_CREATED: [purchaseOrderCreatedHandler],
  PURCHASE_INVOICE_CREATED: [purchaseInvoiceCreatedHandler],
  PURCHASE_PAYMENT_CREATED: [purchasePaymentCreatedHandler],
  PURCHASE_RECEIVE_CREATED: [purchaseReceiveCreatedHandler],
  PURCHASE_RETURN_CREATED: [purchaseReturnCreatedHandler],
  INVENTORY_MOVEMENT_CREATED: [
    {
      consumer: "inventory",
      handle: handleInventoryMovementCreated,
    },
  ],
  PRODUCT_CREATED: [
    {
      consumer: "inventory",
      handle: handleProductCreated,
    },
  ],
  PAYROLL_RUN_COMPLETED: [
    {
      consumer: "accounting",
      handle: handlePayrollRunCompleted,
    },
  ],
  SALARY_SLIP_PUBLISHED: [
    {
      consumer: "payroll",
      handle: handleSalarySlipPublished,
    },
  ],
  JOURNAL_ENTRY_POSTED: [
    {
      consumer: "accounting",
      handle: handleJournalEntryPostedAccounting,
    },
  ],
} as const;

export type IntegrationHandlerType = keyof typeof integrationHandlers;

export function getIntegrationHandlers(type: string) {
  return integrationHandlers[type as IntegrationHandlerType] ?? null;
}
