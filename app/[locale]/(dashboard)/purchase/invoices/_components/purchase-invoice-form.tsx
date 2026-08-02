"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomTextarea } from "@/components/ui/custom-textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Loader2, Trash2, PlusIcon } from "lucide-react";
import { StatusHistoryDialog } from "@/components/ui/status-history-dialog";
import {
  createPurchaseInvoice,
  updatePurchaseInvoice,
  getPurchaseOrder,
  postPurchaseInvoice,
} from "../actions";
import { TaxRate } from "@/prisma/generated/prisma/client";
import { PurchaseInvoiceWithDetails, PurchaseInvoiceInput } from "../types";
import { PurchaseOrderWithDetails } from "../../orders/types";
import { format } from "date-fns";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SortableTableRow } from "@/components/ui/sortable-row";
import { generateId } from "@/lib/utils";
import { SuperJSON } from "@/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import {
  AttachmentDialog,
  Attachment,
} from "@/components/ui/attachment-dialog";
import { uploadFile } from "@/app/[locale]/(dashboard)/general/files/actions";
import { Paperclip } from "lucide-react";
import { Department, Project } from "@/prisma/generated/prisma/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import {
  PageFormActions,
  PageFormContent,
  PageFormHeader,
  PageFormLayout,
  PageFormTitle,
} from "@/components/layout/page/form-layout";

interface PurchaseInvoiceFormProps {
  invoice?: SuperJSONResult | null;
  vendors: { id: string; name: string }[];
  purchaseOrders: SuperJSONResult;
  taxRates: TaxRate[];
  departments?: Department[];
  projects?: Project[];
  readonly?: boolean;
}

export function PurchaseInvoiceForm({
  invoice: serializedInvoice,
  vendors,
  purchaseOrders: serializedPurchaseOrders,
  taxRates,
  departments = [],
  projects = [],
  readonly = false,
}: PurchaseInvoiceFormProps) {
  const invoice = serializedInvoice
    ? SuperJSON.deserialize<PurchaseInvoiceWithDetails>(serializedInvoice)
    : undefined;
  const purchaseOrders = SuperJSON.deserialize<PurchaseOrderWithDetails[]>(
    serializedPurchaseOrders,
  );

  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = !!invoice;
  const confirm = useConfirm();
  const { toast } = useToast();
  const formatCurrency = useFormatCurrency();
  const t = useTranslations("Purchase");
  const tCommon = useTranslations("Common");

  const [attachments, setAttachments] = useState<Attachment[]>(
    invoice?.attachments?.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
    })) || [],
  );
  const [isAttachmentDialogOpen, setIsAttachmentDialogOpen] = useState(false);

  const [formData, setFormData] = useState<
    Omit<PurchaseInvoiceInput, "items"> & {
      items: (PurchaseInvoiceInput["items"][0] & { id: string })[];
    }
  >({
    invoiceNumber: invoice?.invoiceNumber || "",
    contactId: invoice?.contactId || "",
    purchaseOrderId: invoice?.purchaseOrderId || undefined,
    invoiceDate: invoice?.invoiceDate
      ? new Date(invoice.invoiceDate)
      : new Date(),
    dueDate: invoice?.dueDate ? new Date(invoice.dueDate) : new Date(),
    notes: invoice?.notes || "",
    status: invoice?.status || "DRAFT",

    globalDiscount: Number(invoice?.globalDiscount) || 0,
    totalTax: Number(invoice?.totalTax) || 0,
    shippingCost: Number(invoice?.shippingCost) || 0,
    handlingCost: Number(invoice?.handlingCost) || 0,
    departmentId: invoice?.departmentId || undefined,
    projectId: invoice?.projectId || undefined,

    items:
      invoice?.items.map((item) => ({
        id: generateId(),
        description: item.description,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount) || 0,
        tax: Number(item.tax) || 0,
        taxRateId: item.taxRateId || undefined,
      })) || [],
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFormData((prev) => {
        const oldIndex = prev.items.findIndex((item) => item.id === active.id);
        const newIndex = prev.items.findIndex((item) => item.id === over.id);
        return { ...prev, items: arrayMove(prev.items, oldIndex, newIndex) };
      });
    }
  };

  // When Purchase Order is selected, populate items
  const handlePurchaseOrderChange = async (poId: string) => {
    setFormData((prev) => ({ ...prev, purchaseOrderId: poId }));

    if (poId) {
      try {
        // Note: We might need to fetch full PO details if items are not passed fully,
        // but here we rely on purchaseOrders prop or fetch if needed.
        // Actually getPurchaseOrder action is available.
        const serializedFullPo = await getPurchaseOrder(poId);
        const fullPo = serializedFullPo
          ? SuperJSON.deserialize<PurchaseOrderWithDetails>(serializedFullPo)
          : null;

        if (fullPo) {
          // Auto-select vendor
          setFormData((prev) => ({
            ...prev,
            contactId: fullPo.contactId,
            // Inherit dimensions from PO if available and not already set
            departmentId: fullPo.departmentId || prev.departmentId,
            projectId: fullPo.projectId || prev.projectId,
          }));

          // Populate items from PO
          const newItems = fullPo.items.map((item) => ({
            id: generateId(),
            description: item.product?.name || "Item",
            quantity: item.quantity, // Use original qty or remaining? Usually Bill matches PO.
            unitPrice: Number(item.unitCost),
            discount: 0,
            tax: 0,
            taxRateId:
              (item as any).taxRateId ||
              taxRates.find((r) => r.code === "VAT-S")?.id,
          }));

          setFormData((prev) => ({ ...prev, items: newItems }));
        }
      } catch (error) {
        console.error("Failed to fetch PO details", error);
      }
    }
  };

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: generateId(),
          description: "",
          quantity: 1,
          unitPrice: 0,
          discount: 0,
          tax: 0,
          taxRateId: taxRates.find((r) => r.code === "VAT-S")?.id,
        },
      ],
    }));
  };

  const handleRemoveItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof (typeof formData.items)[0],
    value: string | number | undefined,
  ) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const calculateItemValues = useCallback(
    (item: PurchaseInvoiceInput["items"][0] & { id: string }) => {
      const quantity = item.quantity || 0;
      const unitPrice = item.unitPrice || 0;
      const subtotal = quantity * unitPrice;
      const discountAmount = subtotal * ((item.discount || 0) / 100);
      const taxableAmount = Math.max(0, subtotal - discountAmount);

      let taxAmount = 0;
      if (item.taxRateId) {
        const rateObj = taxRates.find((r) => r.id === item.taxRateId);
        if (rateObj) {
          taxAmount = taxableAmount * (Number(rateObj.rate) / 100);
        }
      } else {
        taxAmount = item.tax || 0;
      }

      const total = taxableAmount + taxAmount;
      return { subtotal, discountAmount, taxableAmount, taxAmount, total };
    },
    [taxRates],
  );

  useEffect(() => {
    const calculatedTotalTax = formData.items.reduce((sum, item) => {
      const { taxAmount } = calculateItemValues(item);
      return sum + taxAmount;
    }, 0);

    // Only update if different to avoid infinite loops (though strict equality check on float might be tricky, usually fine for setFormData)
    if (Math.abs(calculatedTotalTax - formData.totalTax) > 0.001) {
      setFormData((prev) => ({ ...prev, totalTax: calculatedTotalTax }));
    }
  }, [formData.items, formData.totalTax, calculateItemValues]);

  const itemsTotal = formData.items.reduce(
    (sum, item) => sum + calculateItemValues(item).total,
    0,
  );

  const itemsNetTotal = formData.items.reduce(
    (sum, item) => sum + calculateItemValues(item).taxableAmount,
    0,
  );

  const totalAmount =
    itemsTotal -
    (formData.globalDiscount || 0) +
    (formData.shippingCost || 0) +
    (formData.handlingCost || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.invoiceNumber) {
      toast({
        title: "Validation Error",
        description: "Please enter invoice number",
        variant: "destructive",
      });
      return;
    }
    if (!formData.contactId) {
      toast({
        title: "Validation Error",
        description: "Please select a vendor",
        variant: "destructive",
      });
      return;
    }
    if (formData.items.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one item",
        variant: "destructive",
      });
      return;
    }
    for (const item of formData.items) {
      if (!item.description) {
        toast({
          title: "Validation Error",
          description: "Please enter description for all items",
          variant: "destructive",
        });
        return;
      }
      if (item.quantity <= 0) {
        toast({
          title: "Validation Error",
          description: "Quantity must be greater than 0",
          variant: "destructive",
        });
        return;
      }
    }

    setIsLoading(true);
    try {
      const submissionData = {
        ...formData,
        items: formData.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: item.tax,
          taxRateId: item.taxRateId || undefined,
        })),
        attachmentIds: attachments.map((a) => a.id),
      };
      let result;
      if (isEditing && invoice) {
        result = await updatePurchaseInvoice(invoice.id, submissionData);
      } else {
        result = await createPurchaseInvoice(submissionData);
      }

      if (result.success) {
        router.push("/purchase/invoices");
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to save invoice",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePost = async () => {
    if (!invoice) return;
    if (
      !(await confirm({
        title: "Post Invoice",
        description:
          "Are you sure you want to post this invoice? This will create a journal entry and cannot be undone.",
      }))
    ) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await postPurchaseInvoice(invoice.id);
      if (result.success) {
        toast({
          title: result.data?.processed ? "Posted" : "Queued",
          description: result.data?.processed ? (
            "Invoice posted successfully"
          ) : (
            <span>
              {result.data?.alreadyQueued
                ? "Invoice posting already queued."
                : "Invoice posting queued for processing."}{" "}
              {result.data?.outboxId ? (
                <Link
                  href={`/admin/integrations/outbox?search=${encodeURIComponent(
                    result.data.outboxId,
                  )}`}
                  className="underline"
                >
                  View outbox
                </Link>
              ) : null}
            </span>
          ),
        });
        router.refresh();
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to post invoice",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter purchase orders based on selected vendor
  const filteredPurchaseOrders = formData.contactId
    ? purchaseOrders.filter((po) => po.contactId === formData.contactId)
    : purchaseOrders;

  return (
    <PageFormLayout>
      <form onSubmit={handleSubmit}>
        <PageFormHeader>
          <PageFormTitle
            title={isEditing ? t("edit_invoice") : t("new_invoice")}
          />
          <PageFormActions>
            {invoice && (
              <Button asChild type="button" variant="outline" size="sm">
                <Link
                  href={`/admin/integrations/outbox?search=${encodeURIComponent(invoice.id)}`}
                >
                  Outbox
                </Link>
              </Button>
            )}
            {invoice?.status === "DRAFT" && (
              <Button
                type="button"
                variant="default"
                onClick={handlePost}
                disabled={isLoading}
              >
                Post Invoice
              </Button>
            )}
            {!readonly && (
              <>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditing ? tCommon("update") : tCommon("create")}
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (window.history.length > 1) {
                  router.back();
                } else {
                  window.close();
                }
              }}
            >
              {tCommon("close")}
            </Button>
          </PageFormActions>
        </PageFormHeader>
        <PageFormContent className="grid gap-3 mt-3 p-0 bg-transparent border-none shadow-none">
          <div className="space-y-3">
            <Card>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <CustomSelect
                        label={t("purchase_order_optional")}
                        value={formData.purchaseOrderId || "none"}
                        onValueChange={(val) =>
                          handlePurchaseOrderChange(val === "none" ? "" : val)
                        }
                        placeholder={t("placeholder_select_purchase_order")}
                        disabled={readonly}
                        options={[
                          { label: "None", value: "none" },
                          ...filteredPurchaseOrders.map((po) => ({
                            label: `${po.orderNumber} (${po.contact.name})`,
                            value: po.id,
                          })),
                        ]}
                      />

                      <CustomInput
                        label={t("invoice_number")}
                        value={formData.invoiceNumber}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            invoiceNumber: e.target.value,
                          }))
                        }
                        placeholder={t("placeholder_auto_generate")}
                        disabled={readonly}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <CustomInput
                        label={t("invoice_date")}
                        type="date"
                        value={
                          formData.invoiceDate
                            ? format(formData.invoiceDate, "yyyy-MM-dd")
                            : ""
                        }
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            invoiceDate: e.target.value
                              ? new Date(e.target.value)
                              : new Date(),
                          }))
                        }
                        disabled={readonly}
                      />

                      <CustomInput
                        label={t("due_date")}
                        type="date"
                        value={
                          formData.dueDate
                            ? format(formData.dueDate, "yyyy-MM-dd")
                            : ""
                        }
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            dueDate: e.target.value
                              ? new Date(e.target.value)
                              : new Date(),
                          }))
                        }
                        disabled={readonly}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          {t("vendor")}
                        </label>
                        <SearchableSelect
                          value={formData.contactId}
                          onValueChange={(val) => {
                            setFormData((prev) => ({
                              ...prev,
                              contactId: val as string,
                              purchaseOrderId: undefined,
                            }));
                          }}
                          options={vendors.map((v) => ({
                            value: v.id,
                            label: v.name,
                            icon: (
                              <Avatar size="sm">
                                <AvatarFallback className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                                  {v.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ),
                          }))}
                          placeholder={t("placeholder_select_vendor")}
                          disabled={readonly || !!formData.purchaseOrderId}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          {t("department")}
                        </label>
                        <SearchableSelect
                          value={formData.departmentId || ""}
                          onValueChange={(val) =>
                            setFormData((prev) => ({
                              ...prev,
                              departmentId: val || null,
                            }))
                          }
                          options={departments.map((d) => ({
                            value: d.id,
                            label: d.name,
                          }))}
                          placeholder={t("placeholder_select_department")}
                          disabled={readonly}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          {t("project")}
                        </label>
                        <SearchableSelect
                          value={formData.projectId || ""}
                          onValueChange={(val) =>
                            setFormData((prev) => ({
                              ...prev,
                              projectId: val || null,
                            }))
                          }
                          options={projects.map((p) => ({
                            value: p.id,
                            label: p.name,
                          }))}
                          placeholder={t("placeholder_select_project")}
                          disabled={readonly}
                        />
                      </div>
                    </div>

                    {isEditing && (
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <CustomSelect
                            value={formData.status}
                            label={t("status")}
                            onValueChange={(val: any) =>
                              setFormData((prev) => ({ ...prev, status: val }))
                            }
                            disabled={
                              readonly ||
                              invoice.status === "PAID" ||
                              invoice.status === "CANCELED"
                            }
                            options={[
                              { label: "Draft", value: "DRAFT" },
                              { label: "Billed", value: "BILLED" },
                              { label: "Paid", value: "PAID" },
                              {
                                label: "Partially Paid",
                                value: "PARTIALLY_PAID",
                              },
                              { label: "Canceled", value: "CANCELED" },
                            ]}
                          />
                        </div>
                        {invoice && (
                          <div className="pb-1">
                            <StatusHistoryDialog
                              events={[
                                {
                                  event: "Created",
                                  at: invoice.createdAt,
                                  byName: invoice.createdBy?.name,
                                },
                                {
                                  event: "Last Updated",
                                  at: invoice.updatedAt,
                                  byName: invoice.updatedBy?.name,
                                },
                                {
                                  event: "Billed",
                                  at: invoice.billedAt,
                                  byName: invoice.billedBy?.name,
                                },
                                {
                                  event: "Cancelled",
                                  at: invoice.cancelledAt,
                                  byName: invoice.cancelledBy?.name,
                                },
                              ]}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <CustomTextarea
                    value={formData.notes || ""}
                    label={t("notes")}
                    className="resize-none h-[85%]"
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    placeholder={t("placeholder_notes")}
                    disabled={readonly}
                  />
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAttachmentDialogOpen(true)}
                    className="w-fit"
                  >
                    <Paperclip className="mr-2 h-4 w-4" />
                    {tCommon("attachments")} ({attachments.length})
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-2 rounded-md border bg-muted px-3 py-1 text-sm"
                      >
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {file.name}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-lg">{tCommon("products")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>{tCommon("description")}</TableHead>
                        <TableHead className="w-[100px]">
                          {tCommon("quantity")}
                        </TableHead>
                        <TableHead className="w-[120px]">
                          {tCommon("price")}
                        </TableHead>
                        <TableHead className="w-[120px]">
                          {tCommon("discount")} (%)
                        </TableHead>
                        <TableHead className="w-[180px]">
                          {tCommon("tax_rate")}
                        </TableHead>
                        <TableHead className="w-[100px]">
                          {tCommon("total")}
                        </TableHead>
                        {!readonly && (
                          <TableHead className="w-[50px]"></TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <SortableContext
                        items={formData.items.map((item) => item.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {formData.items.map((item, index) => (
                          <SortableTableRow key={item.id} id={item.id}>
                            <TableCell>
                              <CustomInput
                                value={item.description}
                                onChange={(e) =>
                                  handleItemChange(
                                    index,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                disabled={readonly}
                              />
                            </TableCell>
                            <TableCell>
                              <CustomInput
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  handleItemChange(
                                    index,
                                    "quantity",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                disabled={readonly}
                              />
                            </TableCell>
                            <TableCell>
                              <CurrencyInput
                                value={item.unitPrice}
                                onChange={(val) =>
                                  handleItemChange(
                                    index,
                                    "unitPrice",
                                    Number(val),
                                  )
                                }
                                disabled={readonly}
                              />
                            </TableCell>
                            <TableCell>
                              <CustomInput
                                type="number"
                                min="0"
                                max="100"
                                value={item.discount}
                                onChange={(e) =>
                                  handleItemChange(
                                    index,
                                    "discount",
                                    Number(e.target.value),
                                  )
                                }
                                disabled={readonly}
                              />
                            </TableCell>
                            <TableCell>
                              <CustomSelect
                                value={item.taxRateId || "manual"}
                                onValueChange={(val) =>
                                  handleItemChange(
                                    index,
                                    "taxRateId",
                                    val === "manual" ? undefined : val,
                                  )
                                }
                                disabled={readonly}
                                options={[
                                  { label: "Manual", value: "manual" },
                                  ...taxRates.map((rate) => ({
                                    label: `${rate.name} (${Number(rate.rate)}%)`,
                                    value: rate.id,
                                  })),
                                ]}
                              />
                              {!item.taxRateId && (
                                <CustomInput
                                  type="number"
                                  min="0"
                                  value={item.tax}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "tax",
                                      Number(e.target.value),
                                    )
                                  }
                                  disabled={readonly}
                                  className="mt-1"
                                  placeholder={tCommon("amount")}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">
                                {formatCurrency(
                                  calculateItemValues(item).total,
                                )}
                              </div>
                            </TableCell>
                            {!readonly && (
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="mb-0.5"
                                  onClick={() => handleRemoveItem(index)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </TableCell>
                            )}
                          </SortableTableRow>
                        ))}
                      </SortableContext>
                    </TableBody>
                  </Table>
                </DndContext>
                {formData.items.length === 0 && (
                  <div className="py-4 text-center text-muted-foreground">
                    {t("no_items_added")}
                  </div>
                )}
                <div className="flex justify-between items-start p-3 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={readonly}
                    size="sm"
                    onClick={handleAddItem}
                  >
                    <PlusIcon /> {t("add_item")}
                  </Button>
                  <div className="w-1/3 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">
                        {t("subtotal_net")}
                      </span>
                      <span className="text-sm">
                        {formatCurrency(itemsNetTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm font-medium">
                        {t("global_discount")}
                      </span>
                      <CurrencyInput
                        value={formData.globalDiscount}
                        onChange={(val) =>
                          setFormData((prev) => ({
                            ...prev,
                            globalDiscount: Number(val),
                          }))
                        }
                        disabled={readonly}
                        className="w-24 h-7"
                      />
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm font-medium">
                        {t("total_tax")}
                      </span>
                      <CurrencyInput
                        value={formData.totalTax}
                        onChange={() => {}}
                        disabled={true}
                        className="w-24 h-7 bg-muted"
                      />
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm font-medium">
                        {t("shipping")}
                      </span>
                      <CurrencyInput
                        value={formData.shippingCost}
                        onChange={(val) =>
                          setFormData((prev) => ({
                            ...prev,
                            shippingCost: Number(val),
                          }))
                        }
                        disabled={readonly}
                        className="w-24 h-7"
                      />
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm font-medium">
                        {t("handling")}
                      </span>
                      <CurrencyInput
                        value={formData.handlingCost}
                        onChange={(val) =>
                          setFormData((prev) => ({
                            ...prev,
                            handlingCost: Number(val),
                          }))
                        }
                        disabled={readonly}
                        className="w-24 h-7"
                      />
                    </div>
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="font-bold text-sm">
                        {tCommon("total")}
                      </span>
                      <span className="font-bold text-sm">
                        {formatCurrency(totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </PageFormContent>
      </form>

      <AttachmentDialog
        open={isAttachmentDialogOpen}
        onOpenChange={setIsAttachmentDialogOpen}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        uploadAction={async (formData) => {
          const res = await uploadFile(formData);
          return res;
        }}
        readonly={readonly}
      />
    </PageFormLayout>
  );
}
