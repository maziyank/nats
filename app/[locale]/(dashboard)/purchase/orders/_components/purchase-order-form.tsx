"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
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
  createPurchaseOrder,
  updatePurchaseOrder,
  issuePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  getPurchaseOrder,
} from "../actions";
import { PurchaseOrderInput } from "../types";
import { format } from "date-fns";
import { cn, generateId } from "@/lib/utils";
import { SortableTableRow } from "@/components/ui/sortable-row";
import { getContacts } from "@/app/[locale]/(dashboard)/general/contacts/actions";
import { getProducts } from "@/app/[locale]/(dashboard)/inventory/products/actions";
import { useConfirm } from "@/hooks/use-confirm";
import { useAlert } from "@/hooks/use-alert";
import { SuperJSONResult } from "superjson";
import { SuperJSON } from "@/lib/superjson";
import { PurchaseOrderWithDetails } from "../types";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface PurchaseOrderFormProps {
  order?: SuperJSONResult;
  vendors: Awaited<ReturnType<typeof getContacts>>["data"];
  products: Awaited<ReturnType<typeof getProducts>>["products"];
  departments?: Department[];
  projects?: Project[];
  taxRates?: TaxRate[];
  readonly?: boolean;
}

export function PurchaseOrderForm({
  order: serializedOrder,
  vendors,
  products: serializedProducts,
  departments = [],
  projects = [],
  taxRates = [],
  readonly = false,
}: PurchaseOrderFormProps) {
  const order = serializedOrder
    ? SuperJSON.deserialize<PurchaseOrderWithDetails>(serializedOrder)
    : undefined;
  const products =
    serializedProducts && "json" in serializedProducts
      ? SuperJSON.deserialize<ProductWithDetails[]>(serializedProducts)
      : [];

  const router = useRouter();
  const t = useTranslations("Purchase");
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
    Omit<PurchaseOrderInput, "items"> & {
      items: (PurchaseOrderInput["items"][0] & { id: string })[];
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
        unitCost: Number(item.unitCost),
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
        { id: generateId(), productId: "", quantity: 1, unitCost: 0 },
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

    // Auto-fill cost if product changes
    if (field === "productId") {
      const product = products?.find((p: { id: string }) => p.id === value);
      if (product) {
        newItems[index].unitCost = Number(product.cost);
      }
    }

    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const totalAmount = formData.items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    if (!formData.contactId) {
      await alert({ title: tCommon("error"), description: t("error_select_vendor") });
      return;
    }
    if (formData.items.length === 0) {
      await alert({
        title: tCommon("error"),
        description: t("error_add_item"),
      });
      return;
    }
    for (const item of formData.items) {
      if (!item.productId) {
        await alert({
          title: tCommon("error"),
          description: t("error_select_product"),
        });
        return;
      }
      if (item.quantity <= 0) {
        await alert({
          title: tCommon("error"),
          description: t("error_quantity_greater_zero"),
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
        result = await updatePurchaseOrder(order.id, submissionData);
      } else {
        result = await createPurchaseOrder(submissionData);
      }

      if (result.success) {
        if (!isEditing) {
          router.push("/purchase/orders");
        } else {
          // Stay on page but show success? Or redirect?
          // Revalidation happens in action, so UI updates.
        }
      } else {
        await alert({ title: tCommon("error"), description: result.error });
      }
    } catch (error) {
      console.error(error);
      await alert({ title: tCommon("error"), description: tCommon("error_occurred") });
    } finally {
      setIsLoading(false);
    }
  };

  const handleIssue = async () => {
    if (!order) return;
    if (
      await confirm({
        title: t("issue_purchase_order"),
        description: t("issue_purchase_order_desc"),
        confirmText: t("issue_order"),
      })
    ) {
      setIsLoading(true);
      try {
        const result = await issuePurchaseOrder(order.id);
        if (!result.success)
          await alert({ title: tCommon("error"), description: result.error });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    if (
      await confirm({
        title: t("cancel_purchase_order"),
        description: t("cancel_purchase_order_desc"),
        confirmText: t("cancel_order"),
        variant: "destructive",
      })
    ) {
      setIsLoading(true);
      try {
        const result = await cancelPurchaseOrder(order.id);
        if (!result.success)
          await alert({ title: tCommon("error"), description: result.error });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleClose = async () => {
    if (!order) return;
    if (
      await confirm({
        title: t("close_purchase_order"),
        description: t("close_purchase_order_desc"),
        confirmText: t("close_order"),
      })
    ) {
      setIsLoading(true);
      try {
        const result = await closePurchaseOrder(order.id);
        if (!result.success)
          await alert({ title: tCommon("error"), description: result.error });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const displayOrderNumber = order?.orderNumber?.startsWith("DRAFT")
    ? "Draft"
    : order?.orderNumber;

  useEffect(() => {
    const checkBudget = async () => {
      // Only check if we have a total amount and date
      if (totalAmount > 0 && formData.orderDate) {
        const res = await checkBudgetAvailability(
          formData.departmentId,
          formData.projectId,
          formData.orderDate,
          totalAmount,
        );
        if (res.success && res.data?.warning) {
          setBudgetWarning(res.data.warning);
        } else {
          setBudgetWarning(null);
        }
      } else {
        setBudgetWarning(null);
      }
    };

    const timer = setTimeout(checkBudget, 500);
    return () => clearTimeout(timer);
  }, [
    totalAmount,
    formData.departmentId,
    formData.projectId,
    formData.orderDate,
  ]);

  const selectedVendor = vendors.find((v) => v.id === formData.contactId);

  return (
    <PageFormLayout>
      <PageFormHeader>
        <PageFormTitle>
          {displayOrderNumber === "Draft"
            ? t("draft_purchase_order")
            : `${t("purchase_order")} ${displayOrderNumber || t("new")}`}
        </PageFormTitle>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              formData.status === "DRAFT"
                ? "bg-gray-500"
                : formData.status === "ISSUED"
                  ? "bg-blue-500"
                  : formData.status === "PARTIALLY_RECEIVED"
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
                  event: tCommon("created"),
                  at: order.createdAt,
                  byName: order.createdBy?.name,
                },
                {
                  event: tCommon("last_updated"),
                  at: order.updatedAt,
                  byName: order.updatedBy?.name,
                },
                {
                  event: t("issued"),
                  at: order.issuedAt,
                  byName: order.issuedBy?.name,
                },
                {
                  event: tCommon("closed"),
                  at: order.closedAt,
                  byName: order.closedBy?.name,
                },
                {
                  event: tCommon("cancelled"),
                  at: order.cancelledAt,
                  byName: order.cancelledBy?.name,
                },
              ]}
            />
          )}
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
                  onClick={handleIssue}
                  disabled={isLoading}
                >
                  <CheckCheckIcon className="mr-2 h-4 w-4" />
                  {t("issue")}
                </Button>
              )}
            </>
          )}

          {formData.status === "ISSUED" && !readonly && (
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
                {tCommon("cancel")}
              </Button>
            </>
          )}

          {formData.status === "PARTIALLY_RECEIVED" && !readonly && (
            <Button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {tCommon("finish")}
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
              <Trash2Icon className="mr-2 h-4 w-4" />
              {tCommon("cancel")}
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
                code="PURCHASE_ORDER"
                input={{ orderId: order.id }}
                title={`${t("purchase_order")} #${order.orderNumber}`}
              />
            </>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeftSquare className="mr-2 h-4 w-4" />
            {tCommon("back")}
          </Button>
        </PageFormActions>
      </PageFormHeader>
      <form onSubmit={handleSubmit}>
        {budgetWarning && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t("budget_warning")}</AlertTitle>
            <AlertDescription>{budgetWarning}</AlertDescription>
          </Alert>
        )}
        <PageFormContent className="grid gap-4 mt-4 p-0 bg-transparent border-none shadow-none">
          <div className="space-y-4">
            <CollapsibleSection
              title={t("overview")}
              collapsedContent={
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{t("vendor")}: {selectedVendor?.name || "-"}</span>
                  <span>{t("order_date")}: {formData.orderDate ? format(formData.orderDate, "dd/MM/yyyy") : "-"}</span>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <CustomSelect
                    value={formData.contactId}
                    label={t("vendor")}
                    onValueChange={(val) =>
                      setFormData((prev) => ({ ...prev, contactId: val }))
                    }
                    placeholder={t("placeholder_select_vendor")}
                    disabled={isReadOnly}
                  >
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </CustomSelect>
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
                        placeholder={t("placeholder_default_budget")}
                        disabled={isReadOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("project")}</label>
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
                        placeholder={t("placeholder_default_budget")}
                        disabled={isReadOnly}
                      />
                    </div>
                  </div>
                </div>
                <CustomTextarea
                  value={formData.notes || ""}
                  label={t("notes")}
                  className="resize-none"
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
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
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t("ordered_items")}</CardTitle>
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
                        <TableHead>{tCommon("product")}</TableHead>
                        <TableHead className="w-[120px]">{t("order_qty")}</TableHead>
                        <TableHead className="w-[80px]">{tCommon("unit")}</TableHead>
                        <TableHead className="w-[150px]">{tCommon("price")}</TableHead>
                        <TableHead className="w-[140px]">{t("tax_rate")}</TableHead>
                        <TableHead className="w-[150px]">{tCommon("total")}</TableHead>
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
                                placeholder={t("placeholder_select_product")}
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
                                )?.purchaseUnit?.symbol ||
                                  products?.find(
                                    (p: { id: string }) =>
                                      p.id === item.productId,
                                  )?.baseUnit?.symbol ||
                                  "-"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <CurrencyInput
                                value={item.unitCost}
                                onChange={(val) =>
                                  handleItemChange(
                                    index,
                                    "unitCost",
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
                                {formatCurrency(item.quantity * item.unitCost)}
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
                    {t("no_items_added")}
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
                  <Plus className="mr-2 h-4 w-4" /> {t("add_item")}
                </Button>
                <div className="flex items-center gap-2 text-md">
                  <span>{t("total_amount")}:</span>
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
