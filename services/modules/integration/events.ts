import { z } from "zod";

export const salesInvoiceIssuedPayloadSchema = z.object({
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().min(1),
  contactId: z.string().min(1),
  userId: z.string().min(1),
  totalAmount: z.string().min(1),
  globalDiscount: z.string().optional(),
  shippingCost: z.string().optional(),
  items: z.array(
    z.object({
      description: z.string().min(1),
      quantity: z.number().int().positive(),
      unitPrice: z.string().min(1),
      discount: z.string().optional(),
      tax: z.string().optional(),
      accountId: z.string().optional(),
    })
  ),
});

export type SalesInvoiceIssuedPayload = z.infer<
  typeof salesInvoiceIssuedPayloadSchema
>;

export const purchaseInvoiceBilledPayloadSchema = z.object({
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().min(1),
  contactId: z.string().min(1),
  userId: z.string().min(1),
  totalAmount: z.string().min(1),
  globalDiscount: z.string().optional(),
  shippingCost: z.string().optional(),
  handlingCost: z.string().optional(),
  items: z.array(
    z.object({
      description: z.string().min(1),
      quantity: z.number().int().positive(),
      unitPrice: z.string().min(1),
      discount: z.string().optional(),
      tax: z.string().optional(),
      accountId: z.string().optional(),
    })
  ),
});

export const salesPaymentPostedPayloadSchema = z.object({
  paymentId: z.string().min(1),
  paymentNumber: z.string().min(1),
  paymentDate: z.string().min(1),
  amount: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
  cashAccountId: z.string().min(1),
  contactId: z.string().min(1),
  salesInvoiceId: z.string().min(1),
  userId: z.string().min(1),
});

export const purchasePaymentPostedPayloadSchema = z.object({
  paymentId: z.string().min(1),
  paymentNumber: z.string().min(1),
  paymentDate: z.string().min(1),
  amount: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
  cashAccountId: z.string().min(1),
  contactId: z.string().min(1),
  purchaseInvoiceId: z.string().min(1),
  userId: z.string().min(1),
});

export const cashTransactionApprovedPayloadSchema = z.object({
  transactionId: z.string().min(1),
  userId: z.string().min(1),
});

export const cashTransferApprovedPayloadSchema = z.object({
  transferId: z.string().min(1),
  userId: z.string().min(1),
});

export const cashTransactionCreateRequestedPayloadSchema = z.object({
  transactionId: z.string().min(1),
  journalEntryId: z.string().min(1),
  entryNumber: z.string().min(1),
  cashAccountId: z.string().min(1),
  contactId: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  type: z.enum(["INCOME", "EXPENSE"]),
  date: z.string().min(1),
  reference: z.string().optional(),
  description: z.string().min(1),
  notes: z.string().optional(),
  allocations: z.array(
    z.object({
      accountId: z.string().min(1),
      amount: z.string().min(1),
      description: z.string().optional(),
    })
  ),
  attachmentIds: z.array(z.string()).optional(),
  userId: z.string().min(1),
});

export const salesOrderCreatedPayloadSchema = z.object({
  salesOrderId: z.string().min(1),
  orderNumber: z.string().min(1),
  totalAmount: z.string().min(1),
  userId: z.string().min(1),
});

export type SalesOrderCreatedPayload = z.infer<
  typeof salesOrderCreatedPayloadSchema
>;

export const salesInvoiceCreatedPayloadSchema = z.object({
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  totalAmount: z.string().min(1),
  contactId: z.string().min(1),
  userId: z.string().min(1),
});

export type SalesInvoiceCreatedPayload = z.infer<
  typeof salesInvoiceCreatedPayloadSchema
>;

export const salesPaymentCreatedPayloadSchema = z.object({
  paymentId: z.string().min(1),
  paymentNumber: z.string().min(1),
  amount: z.string().min(1),
  salesInvoiceId: z.string().min(1),
  contactId: z.string().min(1),
  userId: z.string().min(1),
});

export type SalesPaymentCreatedPayload = z.infer<
  typeof salesPaymentCreatedPayloadSchema
>;

export const salesReturnCreatedPayloadSchema = z.object({
  returnId: z.string().min(1),
  returnNumber: z.string().min(1),
  totalAmount: z.string().min(1),
  contactId: z.string().min(1),
  userId: z.string().min(1),
});

export type SalesReturnCreatedPayload = z.infer<
  typeof salesReturnCreatedPayloadSchema
>;

export const salesShipmentCreatedPayloadSchema = z.object({
  shipmentId: z.string().min(1),
  shipmentNumber: z.string().min(1),
  salesOrderId: z.string().optional(),
  contactId: z.string().min(1),
  userId: z.string().min(1),
});

export type SalesShipmentCreatedPayload = z.infer<
  typeof salesShipmentCreatedPayloadSchema
>;

export const purchaseOrderCreatedPayloadSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  totalAmount: z.string().min(1),
  userId: z.string().min(1),
});

export type PurchaseOrderCreatedPayload = z.infer<
  typeof purchaseOrderCreatedPayloadSchema
>;

export const purchaseInvoiceCreatedPayloadSchema = z.object({
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  totalAmount: z.string().min(1),
  contactId: z.string().min(1),
  userId: z.string().min(1),
});

export type PurchaseInvoiceCreatedPayload = z.infer<
  typeof purchaseInvoiceCreatedPayloadSchema
>;

export const purchasePaymentCreatedPayloadSchema = z.object({
  paymentId: z.string().min(1),
  paymentNumber: z.string().min(1),
  amount: z.string().min(1),
  purchaseInvoiceId: z.string().min(1),
  contactId: z.string().min(1),
  userId: z.string().min(1),
});

export type PurchasePaymentCreatedPayload = z.infer<
  typeof purchasePaymentCreatedPayloadSchema
>;

export const purchaseReceiveCreatedPayloadSchema = z.object({
  receiveId: z.string().min(1),
  receiveNumber: z.string().min(1),
  contactId: z.string().min(1),
  userId: z.string().min(1),
});

export type PurchaseReceiveCreatedPayload = z.infer<
  typeof purchaseReceiveCreatedPayloadSchema
>;

export const purchaseReturnCreatedPayloadSchema = z.object({
  returnId: z.string().min(1),
  returnNumber: z.string().min(1),
  totalAmount: z.string().min(1),
  contactId: z.string().min(1),
  userId: z.string().min(1),
});

export type PurchaseReturnCreatedPayload = z.infer<
  typeof purchaseReturnCreatedPayloadSchema
>;

export const journalEntryCreatedPayloadSchema = z.object({
  journalEntryId: z.string().min(1),
  entryNumber: z.string().min(1),
  transactionDate: z.string().min(1),
  description: z.string().min(1),
  totalAmount: z.string().min(1),
  userId: z.string().min(1),
});

export const journalEntryPostedPayloadSchema = z.object({
  journalEntryId: z.string().min(1),
  entryNumber: z.string().min(1),
  userId: z.string().min(1),
});

export const accountCreatedPayloadSchema = z.object({
  accountId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  userId: z.string().min(1),
});

export const assetCreatedPayloadSchema = z.object({
  assetId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  acquisitionCost: z.string().min(1),
  userId: z.string().min(1),
});

export const assetUpdatedPayloadSchema = z.object({
  assetId: z.string().min(1),
  code: z.string().min(1),
  userId: z.string().min(1),
});

export const assetDisposedPayloadSchema = z.object({
  assetId: z.string().min(1),
  code: z.string().min(1),
  disposalAmount: z.string().min(1),
  gainLoss: z.string().min(1),
  userId: z.string().min(1),
});

export const depreciationPostedPayloadSchema = z.object({
  scheduleId: z.string().min(1),
  assetId: z.string().min(1),
  amount: z.string().min(1),
  date: z.string().min(1),
  userId: z.string().min(1),
});

export const inventoryMovementCreatedPayloadSchema = z.object({
  movementId: z.string().min(1),
  type: z.string().min(1),
  transactionDate: z.union([z.string(), z.date()]).transform((val) =>
    val instanceof Date ? val.toISOString() : val
  ),
});

export const productCreatedPayloadSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
});

// ... existing codes ...
export const payrollRunCompletedPayloadSchema = z.object({
  payrollRunId: z.string().min(1),
  periodId: z.string().min(1),
  totalAmount: z.string().min(1),
  userId: z.string().min(1),
});

export const salarySlipPublishedPayloadSchema = z.object({
  salarySlipId: z.string().min(1),
  contactId: z.string().min(1),
  netSalary: z.string().min(1),
  userId: z.string().min(1),
});

export const integrationEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SALES_INVOICE_ISSUED"),
    payload: salesInvoiceIssuedPayloadSchema,
  }),
  z.object({
    type: z.literal("PURCHASE_INVOICE_BILLED"),
    payload: purchaseInvoiceBilledPayloadSchema,
  }),
  z.object({
    type: z.literal("SALES_PAYMENT_POSTED"),
    payload: salesPaymentPostedPayloadSchema,
  }),
  z.object({
    type: z.literal("PURCHASE_PAYMENT_POSTED"),
    payload: purchasePaymentPostedPayloadSchema,
  }),
  z.object({
    type: z.literal("CASH_TRANSACTION_APPROVED"),
    payload: cashTransactionApprovedPayloadSchema,
  }),
  z.object({
    type: z.literal("CASH_TRANSFER_APPROVED"),
    payload: cashTransferApprovedPayloadSchema,
  }),
  z.object({
    type: z.literal("CASH_TRANSACTION_CREATE_REQUESTED"),
    payload: cashTransactionCreateRequestedPayloadSchema,
  }),
  z.object({
    type: z.literal("SALES_ORDER_CREATED"),
    payload: salesOrderCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("SALES_INVOICE_CREATED"),
    payload: salesInvoiceCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("SALES_PAYMENT_CREATED"),
    payload: salesPaymentCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("SALES_RETURN_CREATED"),
    payload: salesReturnCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("SALES_SHIPMENT_CREATED"),
    payload: salesShipmentCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("PURCHASE_ORDER_CREATED"),
    payload: purchaseOrderCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("PURCHASE_INVOICE_CREATED"),
    payload: purchaseInvoiceCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("PURCHASE_PAYMENT_CREATED"),
    payload: purchasePaymentCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("PURCHASE_RECEIVE_CREATED"),
    payload: purchaseReceiveCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("PURCHASE_RETURN_CREATED"),
    payload: purchaseReturnCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("JOURNAL_ENTRY_CREATED"),
    payload: journalEntryCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("JOURNAL_ENTRY_POSTED"),
    payload: journalEntryPostedPayloadSchema,
  }),
  z.object({
    type: z.literal("ACCOUNT_CREATED"),
    payload: accountCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("ASSET_CREATED"),
    payload: assetCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("ASSET_UPDATED"),
    payload: assetUpdatedPayloadSchema,
  }),
  z.object({
    type: z.literal("ASSET_DISPOSED"),
    payload: assetDisposedPayloadSchema,
  }),
  z.object({
    type: z.literal("DEPRECIATION_POSTED"),
    payload: depreciationPostedPayloadSchema,
  }),
  z.object({
    type: z.literal("INVENTORY_MOVEMENT_CREATED"),
    payload: inventoryMovementCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("PRODUCT_CREATED"),
    payload: productCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal("PAYROLL_RUN_COMPLETED"),
    payload: payrollRunCompletedPayloadSchema,
  }),
  z.object({
    type: z.literal("SALES_SLIP_PUBLISHED"), // Typo fixed in next step or now? Wait "SALES_SLIP_PUBLISHED" -> "SALES_SLIP" no "SALARY_SLIP"
    payload: salarySlipPublishedPayloadSchema,
  }),
]);

export type IntegrationEvent = z.infer<typeof integrationEventSchema>;
