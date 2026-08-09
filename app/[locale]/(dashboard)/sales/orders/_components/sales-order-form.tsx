"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter
} from "@/components/ui/card";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomTextarea } from "@/components/ui/custom-textarea";
import { SelectItem } from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import {
  Loader2,
  Plus,
  Trash2,
  CheckCheckIcon,
  SaveIcon,
  CheckCircle,
  Trash2Icon,
  ArrowLeftSquare,
  PrinterIcon,
  DoorClosedIcon,
} from "lucide-react";
import { StatusHistoryDialog } from "@/components/ui/status-history-dialog";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  createSalesOrder,
  updateSalesOrder,
  confirmSalesOrder,
  cancelSalesOrder,
  closeSalesOrder,
} from "../actions";
import { SalesOrderInput, SalesOrderWithDetails } from "../types";
import { format } from "date-fns";
import { cn, generateId } from "@/lib/utils";
import { SortableTableRow } from "@/components/ui/sortable-row";
import { getContacts } from "@/app/[locale]/(dashboard)/general/contacts/actions";
import { getProducts } from "@/app/[locale]/(dashboard)/inventory/products/actions";
import { useConfirm } from "@/hooks/use-confirm";
import { useAlert } from "@/hooks/use-alert";
import { SuperJSONResult } from "superjson";
import { SuperJSON } from "@/lib/superjson";
import { ProductWithDetails } from "@/app/[locale]/(dashboard)/inventory/types";
import { TaxRate } from "@/prisma/generated/prisma/client";
import { useFormatCurrency } from "@/hooks";
import {
  AttachmentDialog,
  Attachment,
} from "@/components/ui/attachment-dialog";
import { uploadFile } from "@/app/[locale]/(dashboard)/general/files/actions";
import { Paperclip } from "lucide-react";
import { ReportPreviewDialog } from "@/app/[locale]/(dashboard)/reporting/_components/report-preview-dialog";
import { Department, Project } from "@/prisma/generated/prisma/client";
import { checkBudgetAvailability } from "@/app/[locale]/(dashboard)/budgeting/actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import {
  PageFormActions,
  PageFormContent,
  PageFormHeader,
  PageFormLayout,
  PageFormTitle,
} from "@/components/layout/page/form-layout";
import { useTranslations } from "next-intl";

interface SalesOrderFormProps {
  order?: SuperJSONResult;
  customers: Awaited<ReturnType<typeof getContacts>>["data"];
  products: Awaited<ReturnType<typeof getProducts>>["products"];
  departments?: Department[];
  projects?: Project[];
  taxRates?: TaxRate[];
  readonly?: boolean;
}

export function SalesOrderForm({
  order: serializedOrder,
  customers,
  products: serializedProducts,
  departments = [],
  projects = [],
  taxRates = [],
  readonly = false,
}: SalesOrderFormProps) {
  const order = serializedOrder
    ? SuperJSON.deserialize<SalesOrderWithDetails>(serializedOrder)
    : undefined;
  const products =
    serializedProducts && "json" in serializedProducts
      ? SuperJSON.deserialize<ProductWithDetails[]>(serializedProducts)
      : [];

  const router = useRouter();
  const t = useTranslations("Sales");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = !!order;
  const confirm = useConfirm();
  const alert = useAlert();

  // Determine if form should be read-only based on status
  const isDraft = order?.status === "DRAFT" || !order;
  const isReadOnly = readonly || !isDraft;

  const [attachments, setAttachments] = useState<Attachment[]>(
    order?.attachments?.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
    })) || [],
  );
  const [isAttachmentDialogOpen, setIsAttachmentDialogOpen] = useState(false);
  const [isReportPreviewOpen, setIsReportPreviewOpen] = useState(false);

  const [budgetWarning, setBudgetWarning] = useState<string | null>(null);

  const [formData, setFormData] = useState<
    Omit<SalesOrderInput, "items"> & {
      items: (SalesOrderInput["items"][0] & { id: string })[];
    }
  >({
    contactId: order?.contactId || "",
    departmentId: order?.departmentId || null,
    projectId: order?.projectId || null,
    orderDate: order?.orderDate ? new Date(order.orderDate) : new Date(),
    expectedDate: order?.expectedDate ? new Date(order.expectedDate) : null,
    notes: order?.notes || "",
    status: order?.status || "DRAFT",
    items:
      order?.items.map((item) => ({
        id: generateId(),
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })) || [],
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (isReadOnly) return;
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFormData((prev) => {
        const oldIndex = prev.items.findIndex((item) => item.id === active.id);
        const newIndex = prev.items.findIndex((item) => item.id === over.id);
        return { ...prev, items: arrayMove(prev.items, oldIndex, newIndex) };
      });
    }
  };

  const handleAddItem = () => {
    if (isReadOnly) return;
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { id: generateId(), productId: "", quantity: 1, unitPrice: 0 },
      ],
    }));
  };

  const handleRemoveItem = (index: number) => {
    if (isReadOnly) return;
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof (typeof formData.items)[0],
    value: string | number,
  ) => {
    if (isReadOnly) return;
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Auto-fill price if product changes
    if (field === "productId") {
      const product = products?.find((p: { id: string }) => p.id === value);
      if (product) {
        newItems[index].unitPrice = Number(product.price);
      }
    }

    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const totalAmount = formData.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    if (!formData.contactId) {
      await alert({ title: "Error", description: "Please select a customer" });
      return;
    }
    if (formData.items.length === 0) {
      await alert({
        title: "Error",
        description: "Please add at least one item",
      });
      return;
    }
    for (const item of formData.items) {
      if (!item.productId) {
        await alert({
          title: "Error",
          description: "Please select a product for all items",
        });
        return;
      }
      if (item.quantity <= 0) {
        await alert({
          title: "Error",
          description: "Quantity must be greater than 0",
        });
        return;
      }
    }

    setIsLoading(true);
    try {
      const submissionData = {
        ...formData,
        items: formData.items.map(({ id, ...item }) => item),
        attachmentIds: attachments.map((a) => a.id),
      };
      let result;
      if (isEditing && order) {
        result = await updateSalesOrder(order.id, submissionData);
      } else {
        result = await createSalesOrder(submissionData);
      }

      if (result.success) {
        if (!isEditing) {
          router.push("/sales/orders");
        } else {
          // Stay on page but show success? Or redirect?
          // Revalidation happens in action, so UI updates.
        }
      } else {
        await alert({ title: "Error", description: result.error });
      }
    } catch (error) {
      console.error(error);
      await alert({ title: "Error", description: "An error occurred" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!order) return;
    if (
      await confirm({
        title: "Confirm Sales Order",
        description:
          "Are you sure you want to confirm this SO? This will make it immutable and ready to be processed.",
        confirmText: "Confirm Order",
      })
    ) {
      setIsLoading(true);
      try {
        const result = await confirmSalesOrder(order.id);
        if (!result.success)
          await alert({ title: "Error", description: result.error });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    if (
      await confirm({
        title: "Cancel Sales Order",
        description:
          "Are you sure you want to cancel this SO? This action cannot be undone.",
        confirmText: "Cancel Order",
        variant: "destructive",
      })
    ) {
      setIsLoading(true);
      try {
        const result = await cancelSalesOrder(order.id);
        if (!result.success)
          await alert({ title: "Error", description: result.error });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleClose = async () => {
    if (!order) return;
    if (
      await confirm({
        title: "Close Sales Order",
        description:
          "Are you sure you want to close this SO? This indicates that all items have been shipped or the order is finalized.",
        confirmText: "Close Order",
      })
    ) {
      setIsLoading(true);
      try {
        const result = await closeSalesOrder(order.id);
        if (!result.success)
          await alert({ title: "Error", description: result.error });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const displayOrderNumber = order?.orderNumber?.startsWith("DRAFT")
    ? "Draft"
    : order?.orderNumber;

  return (
    <PageFormLayout>
      <PageFormHeader>
        <div className="flex gap-5 items-center">
          <PageFormTitle
            title={
              displayOrderNumber === "Draft"
                ? "Draft Sales Order"
                : `Sales Order ${displayOrderNumber || "New"}`
            }
          />
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                formData.status === "DRAFT"
                  ? "bg-gray-500"
                  : formData.status === "CONFIRMED"
                    ? "bg-blue-500"
                    : formData.status === "PARTIALLY_SHIPPED"
                      ? "bg-yellow-500"
                      : formData.status === "CLOSED"
                        ? "bg-green-500"
                        : "bg-red-500",
              )}
            />
            <span className="font-medium">
              {formData.status?.replace("_", " ")}
            </span>
            {order && (
              <StatusHistoryDialog
                events={[
                  {
                    event: "Created",
                    at: order.createdAt,
                    byName: order.createdBy?.name,
                  },
                  {
                    event: "Last Updated",
                    at: order.updatedAt,
                    byName: order.updatedBy?.name,
                  },
                  {
                    event: "Confirmed",
                    at: order.confirmedAt,
                    byName: order.confirmedBy?.name,
                  },
                  {
                    event: "Closed",
                    at: order.closedAt,
                    byName: order.closedBy?.name,
                  },
                  {
                    event: "Cancelled",
                    at: order.cancelledAt,
                    byName: order.cancelledBy?.name,
                  },
                ]}
              />
            )}
          </div>
        </div>
        <PageFormActions>
          {/* Action Buttons */}
          {isDraft && !readonly && (
            <>
              <Button type="submit" disabled={isLoading} onClick={handleSubmit}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!isLoading && <SaveIcon className="mr-2 h-4 w-4" />}
                {isEditing ? tCommon("save") : tCommon("create")}
              </Button>
              {isEditing && (
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isLoading}
                >
                  <CheckCheckIcon className="mr-2 h-4 w-4" />
                  {tCommon("confirm")}
                </Button>
              )}
            </>
          )}

          {formData.status === "CONFIRMED" && !readonly && (
            <>
              <Button type="button" onClick={handleClose} disabled={isLoading}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {tCommon("finish")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancel}
                disabled={isLoading}
              >
                <Trash2Icon className="mr-2 h-4 w-4" />
                {tCommon("discard")}
              </Button>
            </>
          )}

          {formData.status === "PARTIALLY_SHIPPED" && !readonly && (
            <Button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
            >
              <CheckCircle />
              Finish
            </Button>
          )}

          {/* Allow cancelling Drafts too */}
          {isDraft && isEditing && !readonly && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              disabled={isLoading}
            >
              <Trash2Icon />
              Discard
            </Button>
          )}

          {order && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsReportPreviewOpen(true)}
              >
                <PrinterIcon className="mr-2 h-4 w-4" />
                {tCommon("print")}
              </Button>
              <ReportPreviewDialog
                isOpen={isReportPreviewOpen}
                onOpenChange={setIsReportPreviewOpen}
                code="SALES_ORDER"
                input={{ orderId: order.id }}
                title={`Sales Order #${order.orderNumber}`}
              />
            </>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
              } else {
                window.close();
              }
            }}
          >
            <ArrowLeftSquare className="mr-2 h-4 w-4" />
            {tCommon("close")}
          </Button>
        </PageFormActions>
      </PageFormHeader>
      {budgetWarning && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Budget Warning</AlertTitle>
          <AlertDescription>{budgetWarning}</AlertDescription>
        </Alert>
      )}{" "}
      <form onSubmit={handleSubmit}>
        <PageFormContent className="grid gap-4 mt-4 p-0 bg-transparent border-none shadow-none">
          <div className="space-y-4">
            <CollapsibleSection
              title={t("overview") || "Overview"}
              collapsedContent={
                <div className="flex flex-wrap gap-4 text-sm">
                  <span><strong>{t("customer")}:</strong> {customers.find(c => c.id === formData.contactId)?.name || "-"}</span>
                  <span><strong>{t("order_date")}:</strong> {formData.orderDate ? format(formData.orderDate, "dd MMM yyyy") : "-"}</span>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t("customer")}
                    </label>
                    <SearchableSelect
                      value={formData.contactId}
                      onValueChange={(val) =>
                        setFormData((prev) => ({
                          ...prev,
                          contactId: val as string,
                        }))
                      }
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
                      placeholder={t("placeholder_select_customer")}
                      disabled={isReadOnly}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <CustomInput
                      type="date"
                      label={t("order_date")}
                      id="order_date"
                      value={
                        formData.orderDate
                          ? format(formData.orderDate, "yyyy-MM-dd")
                          : ""
                      }
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          orderDate: e.target.value
                            ? new Date(e.target.value)
                            : new Date(),
                        }))
                      }
                      disabled={isReadOnly}
                    />
                    <CustomInput
                      type="date"
                      label={t("expected_date")}
                      id="expected_date"
                      value={
                        formData.expectedDate
                          ? format(formData.expectedDate, "yyyy-MM-dd")
                          : ""
                      }
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          expectedDate: e.target.value
                            ? new Date(e.target.value)
                            : null,
                        }))
                      }
                      disabled={isReadOnly}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
                      />
                    </div>
                  </div>
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
                  disabled={isReadOnly}
                />
                <div className="flex flex-col gap-2">
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
                        <TableHead>{tCommon("product")}</TableHead>
                        <TableHead className="w-[120px]">
                          {tCommon("quantity")}
                        </TableHead>
                        <TableHead className="w-[80px]">
                          {tCommon("unit")}
                        </TableHead>
                        <TableHead className="w-[150px]">
                          {tCommon("price")}
                        </TableHead>
                        <TableHead className="w-[140px]">
                          {tCommon("tax_rate")}
                        </TableHead>
                        <TableHead className="w-[150px]">
                          {tCommon("total")}
                        </TableHead>
                        <TableHead className="w-[50px]"></TableHead>
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
                              <CustomSelect
                                value={item.productId}
                                onValueChange={(val) =>
                                  handleItemChange(index, "productId", val)
                                }
                                placeholder={tCommon(
                                  "placeholder_select_product",
                                )}
                                disabled={isReadOnly}
                              >
                                {products?.map(
                                  (p: {
                                    id: string;
                                    name: string;
                                    sku: string;
                                  }) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name} ({p.sku})
                                    </SelectItem>
                                  ),
                                )}
                              </CustomSelect>
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
                                    Number(e.target.value),
                                  )
                                }
                                disabled={isReadOnly}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex h-10 items-center text-sm text-muted-foreground">
                                {products?.find(
                                  (p: { id: string }) =>
                                    p.id === item.productId,
                                )?.salesUnit?.symbol ||
                                  products?.find(
                                    (p: { id: string }) =>
                                      p.id === item.productId,
                                  )?.baseUnit?.symbol ||
                                  "-"}
                              </div>
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
                                disabled={isReadOnly}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                                {(() => {
                                  const product = products?.find(
                                    (p: { id: string }) =>
                                      p.id === item.productId,
                                  );
                                  const rate = taxRates.find(
                                    (r) => r.id === product?.taxRateId,
                                  );
                                  return rate
                                    ? `${rate.name} (${Number(rate.rate)}%)`
                                    : "-";
                                })()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">
                                {formatCurrency(item.quantity * item.unitPrice)}
                              </div>
                            </TableCell>
                            <TableCell>
                              {!isReadOnly && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-500 hover:text-red-700"
                                  onClick={() => handleRemoveItem(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </SortableTableRow>
                        ))}
                      </SortableContext>
                    </TableBody>
                  </Table>
                </DndContext>
                {formData.items.length === 0 && (
                  <div className="py-8 text-center text-muted-foreground">
                    No items added.
                  </div>
                )}
              </CardContent>
              <CardFooter className="justify-between border-t p-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isReadOnly}
                  onClick={handleAddItem}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Item
                </Button>
                <div className="flex items-center gap-2 text-md">
                  <span>Total Amount:</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              </CardFooter>
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
        readonly={isReadOnly}
      />
    </PageFormLayout>
  );
}
