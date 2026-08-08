import { z } from "zod";
import {
  SalesInvoiceStatus,
  MovementType,
  CashTransactionType,
  PurchaseOrderStatus,
  PurchaseReceiveStatus,
  PurchaseReturnStatus,
} from "@/prisma/generated/prisma/client";

// --- Shared Schemas ---
export const idSchema = z.string().cuid().optional();
export const requiredIdSchema = z.string().cuid();
export const dateSchema = z.coerce.date();
export const decimalSchema = z.union([z.number(), z.string()]).transform((val) => Number(val));
/** Non-negative decimal (0 allowed). Use an extra `.refine(val => val > 0)` for strict positivity. */
export const nonNegativeDecimalSchema = decimalSchema.refine((val) => val >= 0, {
  message: "Must be non-negative",
});
/** @deprecated Use nonNegativeDecimalSchema; kept as alias for existing call sites. */
export const positiveDecimalSchema = nonNegativeDecimalSchema;
export const auditLogQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  action: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
});

// --- Accounting ---
export const createJournalEntryLineSchema = z.object({
  accountId: requiredIdSchema,
  debitAmount: positiveDecimalSchema.optional().default(0),
  creditAmount: positiveDecimalSchema.optional().default(0),
  description: z.string().optional(),
  contactId: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
});

export const createJournalEntrySchema = z.object({
  entryNumber: z.string().optional(),
  transactionDate: dateSchema,
  description: z.string().min(1, "Description is required"),
  notes: z.string().optional(),
  lines: z.array(createJournalEntryLineSchema).min(2, "At least 2 lines required"),
  attachments: z.array(z.object({ id: z.string() })).optional(),
});

// --- Sales Invoice ---
export const salesInvoiceItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: positiveDecimalSchema.refine((val) => val > 0, "Quantity must be greater than 0"),
  unitPrice: positiveDecimalSchema,
  discount: positiveDecimalSchema.optional().default(0),
  tax: positiveDecimalSchema.optional().default(0),
  taxRateId: z.string().optional(),
  productId: z.string().optional(),
  accountId: z.string().optional(),
});

export const salesInvoiceSchema = z.object({
  invoiceNumber: z.string().optional(), // Auto-generated if missing
  contactId: requiredIdSchema,
  salesOrderId: z.string().optional(),
  invoiceDate: dateSchema,
  dueDate: dateSchema,
  notes: z.string().optional(),
  status: z.nativeEnum(SalesInvoiceStatus).optional(),
  globalDiscount: positiveDecimalSchema.optional().default(0),
  totalTax: positiveDecimalSchema.optional().default(0),
  shippingCost: positiveDecimalSchema.optional().default(0),
  departmentId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  items: z.array(salesInvoiceItemSchema).min(1, "At least 1 item required"),
  attachmentIds: z.array(z.string()).optional(),
});

// --- Inventory ---
export const inventoryMovementItemSchema = z.object({
  productId: requiredIdSchema,
  quantity: positiveDecimalSchema.refine((val) => val > 0, "Quantity must be greater than 0"),
  uomType: z.enum(["base", "purchase", "sales"]).optional(),
  unitCost: positiveDecimalSchema.optional(),
  locationId: z.string().optional(),
  batchNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const inventoryMovementSchema = z.object({
  type: z.nativeEnum(MovementType),
  fromWarehouseId: z.string().optional(),
  toWarehouseId: z.string().optional(),
  items: z.array(inventoryMovementItemSchema).min(1, "At least 1 item required"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

// --- Purchase Invoice ---
export const purchaseInvoiceItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: positiveDecimalSchema.refine((val) => val > 0, "Quantity must be greater than 0"),
  unitPrice: positiveDecimalSchema,
  discount: positiveDecimalSchema.optional().default(0),
  tax: positiveDecimalSchema.optional().default(0),
  taxRateId: z.string().optional(),
  productId: z.string().optional(),
  accountId: z.string().optional(),
  purchaseOrderItemId: z.string().optional(),
});

export const purchaseInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"), // Vendor provided
  contactId: requiredIdSchema,
  purchaseOrderId: z.string().optional(),
  invoiceDate: dateSchema,
  dueDate: dateSchema,
  notes: z.string().optional(),
  globalDiscount: positiveDecimalSchema.optional().default(0),
  totalTax: positiveDecimalSchema.optional().default(0),
  shippingCost: positiveDecimalSchema.optional().default(0),
  handlingCost: positiveDecimalSchema.optional().default(0),
  departmentId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  items: z.array(purchaseInvoiceItemSchema).min(1, "At least 1 item required"),
  attachmentIds: z.array(z.string()).optional(),
});

// --- Purchase Order ---
export const purchaseOrderItemSchema = z.object({
  productId: requiredIdSchema,
  quantity: decimalSchema.refine((val) => val > 0, "Quantity must be greater than 0"),
  unitCost: nonNegativeDecimalSchema,
});

export const purchaseOrderSchema = z.object({
  contactId: requiredIdSchema,
  orderDate: dateSchema,
  expectedDate: dateSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
  items: z.array(purchaseOrderItemSchema).min(1, "At least 1 item required"),
  attachmentIds: z.array(z.string()).optional(),
  departmentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

// --- Purchase Receive ---
export const purchaseReceiveItemSchema = z.object({
  productId: requiredIdSchema,
  quantity: decimalSchema.refine((val) => val > 0, "Quantity must be greater than 0"),
  purchaseOrderItemId: z.string().optional(),
});

export const purchaseReceiveSchema = z.object({
  contactId: requiredIdSchema,
  purchaseOrderId: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  receiveDate: dateSchema,
  notes: z.string().optional(),
  status: z.nativeEnum(PurchaseReceiveStatus).optional(),
  items: z.array(purchaseReceiveItemSchema).min(1, "At least 1 item required"),
  attachmentIds: z.array(z.string()).optional(),
});

// --- Purchase Return ---
export const purchaseReturnItemSchema = z.object({
  productId: requiredIdSchema,
  quantity: decimalSchema.refine((val) => val > 0, "Quantity must be greater than 0"),
  unitPrice: nonNegativeDecimalSchema,
});

export const purchaseReturnSchema = z.object({
  returnNumber: z.string().min(1, "Return number is required"),
  contactId: requiredIdSchema,
  purchaseOrderId: z.string().optional(),
  purchaseInvoiceId: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  returnDate: dateSchema,
  reason: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(PurchaseReturnStatus).optional(),
  items: z.array(purchaseReturnItemSchema).min(1, "At least 1 item required"),
  attachmentIds: z.array(z.string()).optional(),
});

// --- Payments ---
export const salesPaymentSchema = z.object({
  paymentNumber: z.string().optional(),
  contactId: requiredIdSchema,
  salesInvoiceId: requiredIdSchema,
  paymentDate: dateSchema,
  amount: positiveDecimalSchema.refine((val) => val > 0, "Amount must be greater than 0"),
  reference: z.string().optional(),
  notes: z.string().optional(),
  method: z.string().min(1, "Payment method is required"),
  cashAccountId: requiredIdSchema,
  departmentId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  attachmentIds: z.array(z.string()).optional(),
});

export const purchasePaymentSchema = z.object({
  paymentNumber: z.string().optional(),
  contactId: requiredIdSchema,
  purchaseInvoiceId: requiredIdSchema,
  paymentDate: dateSchema,
  amount: positiveDecimalSchema.refine((val) => val > 0, "Amount must be greater than 0"),
  reference: z.string().optional(),
  notes: z.string().optional(),
  cashAccountId: requiredIdSchema,
  departmentId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  attachmentIds: z.array(z.string()).optional(),
});

// --- Cash Transaction ---
export const cashTransactionAllocationSchema = z.object({
  accountId: requiredIdSchema,
  amount: positiveDecimalSchema.refine((val) => val > 0, "Amount must be greater than 0"),
  description: z.string().optional(),
});

export const cashTransactionSchema = z.object({
  cashAccountId: requiredIdSchema,
  contactId: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  type: z.nativeEnum(CashTransactionType),
  date: dateSchema,
  reference: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  notes: z.string().optional(),
  allocations: z.array(cashTransactionAllocationSchema).min(1, "At least 1 allocation required"),
  attachmentIds: z.array(z.string()).optional(),
});

// --- Cash Transfer ---
export const cashTransferSchema = z.object({
  fromAccountId: requiredIdSchema,
  toAccountId: requiredIdSchema,
  amount: positiveDecimalSchema.refine((val) => val > 0, "Amount must be greater than 0"),
  date: dateSchema,
  description: z.string().optional(),
  reference: z.string().optional(),
});
