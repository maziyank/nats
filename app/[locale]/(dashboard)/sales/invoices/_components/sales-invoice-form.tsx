"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomTextarea } from "@/components/ui/custom-textarea";
import { SelectItem } from "@/components/ui/select";
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
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  createSalesInvoice,
  updateSalesInvoice,
  getSalesOrder,
  postSalesInvoice,
} from "../actions";
import { TaxRate } from "@/prisma/generated/prisma/client";
import { SalesInvoiceWithDetails, SalesInvoiceInput } from "../types";
import { SalesOrderWithDetails } from "../../orders/types";
import { useFormatDate } from "@/hooks";
import { format } from "date-fns";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SortableTableRow } from "@/components/ui/sortable-row";
import { generateId } from "@/services/lib/utils";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import {
  AttachmentDialog,
  Attachment,
} from "@/components/ui/attachment-dialog";
import { uploadFile } from "@/app/[locale]/(dashboard)/general/files/actions";
import { Paperclip, PrinterIcon } from "lucide-react";
import { ReportPreviewDialog } from "@/app/[locale]/(dashboard)/reporting/_components/report-preview-dialog";
import { Department, Project } from "@/prisma/generated/prisma/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  PageFormActions,
  PageFormContent,
  PageFormHeader,
  PageFormLayout,
  PageFormTitle,
} from "@/components/layout/page/form-layout";

interface SalesInvoiceFormProps {
  invoice?: SuperJSONResult | null;
  customers: { id: string; name: string }[];
  salesOrders: SuperJSONResult;
  taxRates: TaxRate[];
  departments?: Department[];
  projects?: Project[];
  readonly?: boolean;
}

export function SalesInvoiceForm({
  invoice: serializedInvoice,
  customers,
  salesOrders: serializedSalesOrders,
  taxRates,
  departments = [],
  projects = [],
  readonly = false,
}: SalesInvoiceFormProps) {
  const invoice = serializedInvoice
    ? SuperJSON.deserialize<SalesInvoiceWithDetails>(serializedInvoice)
    : undefined;
  const salesOrders = SuperJSON.deserialize<SalesOrderWithDetails[]>(
    serializedSalesOrders,
  );

  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = !!invoice;
  const formatDate = useFormatDate();
  const confirm = useConfirm();
  const { toast } = useToast();
  const t = useTranslations("Sales");
  const tCommon = useTranslations("Common");

  const [attachments, setAttachments] = useState<Attachment[]>(
    invoice?.attachments?.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
    })) || [],
  );
  const [isAttachmentDialogOpen, setIsAttachmentDialogOpen] = useState(false);
  const [isReportPreviewOpen, setIsReportPreviewOpen] = useState(false);

  const [formData, setFormData] = useState<
    Omit<SalesInvoiceInput, "items"> & {
      items: (SalesInvoiceInput["items"][0] & { id: string })[];
    }
  >({
    invoiceNumber: invoice?.invoiceNumber || "",
    contactId: invoice?.contactId || "",
    salesOrderId: invoice?.salesOrderId || undefined,
    invoiceDate: invoice?.invoiceDate
      ? new Date(invoice.invoiceDate)
      : new Date(),
    dueDate: invoice?.dueDate ? new Date(invoice.dueDate) : new Date(),
    notes: invoice?.notes || "",
    status: invoice?.status || "DRAFT",

    globalDiscount: Number(invoice?.globalDiscount) || 0,
    totalTax: Number(invoice?.totalTax) || 0,
    shippingCost: Number(invoice?.shippingCost) || 0,
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
        productId: item.productId || undefined,
        accountId: item.accountId || undefined,
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

  // When Sales Order is selected, populate items
  const handleSalesOrderChange = async (soId: string) => {
    setFormData((prev) => ({ ...prev, salesOrderId: soId }));

    if (soId) {
      try {
        const serializedFullSo = await getSalesOrder(soId);
        const fullSo = serializedFullSo
          ? SuperJSON.deserialize<SalesOrderWithDetails>(serializedFullSo)
          : null;

        if (fullSo) {
          // Auto-select customer
          setFormData((prev) => ({
            ...prev,
            contactId: fullSo.contactId,
            departmentId: fullSo.departmentId || prev.departmentId,
            projectId: fullSo.projectId || prev.projectId,
          }));

          // Populate items from SO
          const newItems = fullSo.items.map((item) => ({
            id: generateId(),
            description: item.product?.name || "Item",
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice), // Assuming unitPrice exists on SO Item
            discount: 0,
            tax: 0,
            taxRateId:
              (item as any).taxRateId ||
              taxRates.find((r) => r.code === "VAT-S")?.id,
          }));

          setFormData((prev) => ({ ...prev, items: newItems }));
        }
      } catch (error) {
        console.error("Failed to fetch SO details", error);
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

  const calculateItemValues = (item: (typeof formData.items)[0]) => {
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
  };

  useEffect(() => {
    const calculatedTotalTax = formData.items.reduce((sum, item) => {
      const { taxAmount } = calculateItemValues(item);
      return sum + taxAmount;
    }, 0);

    if (Math.abs(calculatedTotalTax - formData.totalTax) > 0.001) {
      setFormData((prev) => ({ ...prev, totalTax: calculatedTotalTax }));
    }
  }, [formData.items]);

  const itemsNetTotal = formData.items.reduce(
    (sum, item) => sum + calculateItemValues(item).taxableAmount,
    0,
  );

  const totalAmount =
    itemsNetTotal -
    (formData.globalDiscount || 0) +
    (formData.shippingCost || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate
    if (!formData.contactId) {
      toast({
        title: "Validation Error",
        description: "Please select a customer",
        variant: "destructive",
      });
      return;
    }
    // Note: invoiceNumber might be auto-generated by backend if empty,
    // but form usually requires it if shown.
    // The Purchase form alerts if empty.
    // The Sales actions.ts I read allows empty and generates it.
    // I will make it optional in validation here if the backend handles it,
    // but let's stick to the purchase form pattern for now,
    // OR allow it to be empty if the user didn't type it (let backend generate).
    // The purchase form says: if (!formData.invoiceNumber) alert...
    // I'll assume for Sales it might be auto-generated.

    if (formData.items.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one item",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const submissionData = {
        ...formData,
        items: formData.items.map(({ id, ...item }) => item),
        attachmentIds: attachments.map((a) => a.id),
      };
      let result;
      if (isEditing && invoice) {
        result = await updateSalesInvoice(invoice.id, submissionData);
      } else {
        result = await createSalesInvoice(submissionData);
      }

      if (result.success) {
        router.push("/sales/invoices");
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
      const result = await postSalesInvoice(invoice.id);
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

  const filteredSalesOrders = formData.contactId
    ? salesOrders.filter((so) => so.contactId === formData.contactId)
    : salesOrders;

  return (
    <PageFormLayout>
      <form onSubmit={handleSubmit}>
        <PageFormHeader>
          <PageFormTitle
            title={isEditing ? "Edit Sales Invoice" : "New Sales Invoice"}
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
            {invoice && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsReportPreviewOpen(true)}
              >
                <PrinterIcon className="mr-2 h-4 w-4" />
                Print
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
                <Button
                  type="submit"
                  disabled={isLoading}
                  onClick={handleSubmit}
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditing ? "Update" : "Create"}
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
              Close
            </Button>
          </PageFormActions>
        </PageFormHeader>
        <PageFormContent className="grid gap-3 mt-3 p-0 bg-transparent border-none shadow-none">
          <div className="space-y-3">
            <CollapsibleSection
              title={t("overview") || "Overview"}
              collapsedContent={
                <div className="flex flex-wrap gap-4 text-sm">
                  <span><strong>{t("invoice_number")}:</strong> {formData.invoiceNumber || "-"}</span>
                  <span><strong>{t("customer")}:</strong> {customers.find(c => c.id === formData.contactId)?.name || "-"}</span>
                  <span><strong>{t("invoice_date")}:</strong> {formData.invoiceDate ? format(formData.invoiceDate, "dd MMM yyyy") : "-"}</span>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <CustomSelect
                      label={t("sales_order_optional")}
                      value={formData.salesOrderId || "none"}
                      onValueChange={(val) =>
                        handleSalesOrderChange(val === "none" ? "" : val)
                      }
                      placeholder="Select Sales Order"
                      disabled={readonly}
                    >
                      <SelectItem value="none">None</SelectItem>
                      {filteredSalesOrders.map((so) => (
                        <SelectItem key={so.id} value={so.id}>
                          <div className="flex items-center">
                            <span>{so.orderNumber}</span>
                            <span className="text-muted-foreground ml-2">
                              ({so.contact.name})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </CustomSelect>

                    <CustomInput
                      label={t("invoice_number")}
                      value={formData.invoiceNumber}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          invoiceNumber: e.target.value,
                        }))
                      }
                      placeholder="Leave empty to auto-generate"
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
                        {t("customer")}
                      </label>
                      <SearchableSelect
                        value={formData.contactId}
                        onValueChange={(val) => {
                          setFormData((prev) => ({
                            ...prev,
                            contactId: val as string,
                            salesOrderId: undefined,
                          }));
                        }}
                        options={customers.map((c) => ({
                          value: c.id,
                          label: c.name,
                          icon: (
                            <Avatar size="sm">
                              <AvatarFallback className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                {c.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ),
                        }))}
                        placeholder="Select Customer"
                        disabled={readonly || !!formData.salesOrderId}
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
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          onValueChange={(val: any) =>
                            setFormData((prev) => ({ ...prev, status: val }))
                          }
                          disabled={
                            readonly ||
                            invoice.status === "PAID" ||
                            invoice.status === "CANCELLED"
                          }
                        >
                          <SelectItem value="DRAFT">Draft</SelectItem>
                          <SelectItem value="ISSUED">Issued</SelectItem>
                          <SelectItem value="PAID">Paid</SelectItem>
                          <SelectItem value="PARTIALLY_PAID">
                            Partially Paid
                          </SelectItem>
                          <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        </CustomSelect>
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
                                event: "Issued",
                                at: invoice.issuedAt,
                                byName: invoice.issuedBy?.name,
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
                  placeholder="Add notes here..."
                  disabled={readonly}
                />
              </div>
              <div className="flex flex-col gap-2 mt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAttachmentDialogOpen(true)}
                  className="w-fit"
                >
                  <Paperclip className="mr-2 h-4 w-4" />
                  Attachments ({attachments.length})
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
            </CollapsibleSection>

            <Card> 
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
                        {/* Removed Account Header to match cells */}
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
                        items={formData.items}
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
                              <div className="flex flex-col">
                                <input
                                  type="hidden"
                                  value={item.taxRateId || ""}
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
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">
                                {calculateItemValues(
                                  item,
                                ).total.toLocaleString()}
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
                    No items added.
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
                    <PlusIcon /> Add Item
                  </Button>
                  <div className="w-1/3 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">
                        Subtotal (Net)
                      </span>
                      <span className="text-sm">
                        {itemsNetTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm font-medium">
                        Global Discount
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
                      <span className="text-sm font-medium">Total Tax</span>
                      <CurrencyInput
                        value={formData.totalTax}
                        onChange={() => {}}
                        disabled={true}
                        className="w-24 h-7 bg-muted"
                      />
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm font-medium">Shipping</span>
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
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="font-bold text-sm">Total</span>
                      <span className="font-bold text-sm">
                        {totalAmount.toLocaleString()}
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

      {invoice && (
        <ReportPreviewDialog
          isOpen={isReportPreviewOpen}
          onOpenChange={setIsReportPreviewOpen}
          code="SALES_INVOICE"
          input={{ invoiceId: invoice.id }}
          title={`Invoice #${invoice.invoiceNumber}`}
        />
      )}
    </PageFormLayout>
  );
}
