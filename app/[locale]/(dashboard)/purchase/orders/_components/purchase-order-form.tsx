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
} from "lucide-react";
import { StatusHistoryDialog } from "@/components/ui/status-history-dialog";
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
import { Paperclip, PrinterIcon } from "lucide-react";
import { ReportPreviewDialog } from "@/app/[locale]/(dashboard)/reporting/_components/report-preview-dialog";
import { Department, Project } from "@/prisma/generated/prisma/client";
import { checkBudgetAvailability } from "@/app/[locale]/(dashboard)/budgeting/actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

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
      await alert({ title: "Error", description: "Please select a vendor" });
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
        await alert({ title: "Error", description: result.error });
      }
    } catch (error) {
      console.error(error);
      await alert({ title: "Error", description: "An error occurred" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleIssue = async () => {
    if (!order) return;
    if (
      await confirm({
        title: "Issue Purchase Order",
        description:
          "Are you sure you want to issue this PO? This will make it immutable and ready to be sent to the vendor.",
        confirmText: "Issue Order",
      })
    ) {
      setIsLoading(true);
      try {
        const result = await issuePurchaseOrder(order.id);
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
        title: "Cancel Purchase Order",
        description:
          "Are you sure you want to cancel this PO? This action cannot be undone.",
        confirmText: "Cancel Order",
        variant: "destructive",
      })
    ) {
      setIsLoading(true);
      try {
        const result = await cancelPurchaseOrder(order.id);
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
        title: "Close Purchase Order",
        description:
          "Are you sure you want to close this PO? This indicates that all items have been received or the order is finalized.",
        confirmText: "Close Order",
      })
    ) {
      setIsLoading(true);
      try {
        const result = await closePurchaseOrder(order.id);
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

  return (
    <div className="flex-1 space-y-4 px-4 pt-0">
      <div className="flex items-center justify-between space-y-2">
        <div className="flex gap-5">
          <h2 className="text-xl font-bold tracking-tight flex-1">
            {displayOrderNumber === "Draft"
              ? "Draft Purchase Order"
              : `Purchase Order ${displayOrderNumber || "New"}`}
          </h2>
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
                    event: "Issued",
                    at: order.issuedAt,
                    byName: order.issuedBy?.name,
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
        <div className="flex gap-2 text-sm">
          {/* Action Buttons */}
          {isDraft && !readonly && (
            <>
              <Button type="submit" disabled={isLoading} onClick={handleSubmit}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!isLoading && <SaveIcon />}
                {isEditing ? "Save" : "Create"}
              </Button>
              {isEditing && (
                <Button
                  type="button"
                  onClick={handleIssue}
                  disabled={isLoading}
                >
                  <CheckCheckIcon />
                  Issue
                </Button>
              )}
            </>
          )}

          {formData.status === "ISSUED" && !readonly && (
            <>
              <Button type="button" onClick={handleClose} disabled={isLoading}>
                <CheckCircle />
                Finish
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancel}
                disabled={isLoading}
              >
                <Trash2Icon />
                Discard
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
                Print
              </Button>
              <ReportPreviewDialog
                isOpen={isReportPreviewOpen}
                onOpenChange={setIsReportPreviewOpen}
                code="PURCHASE_ORDER"
                input={{ orderId: order.id }}
                title={`Purchase Order #${order.orderNumber}`}
              />
            </>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeftSquare />
            Back
          </Button>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        {budgetWarning && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Budget Warning</AlertTitle>
            <AlertDescription>{budgetWarning}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4">
          <div className="space-y-4">
            <CollapsibleSection
              title="Overview"
              collapsedContent={
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>Vendor: {vendors.find((v) => v.id === formData.contactId)?.name || "-"}</span>
                  <span>Order Date: {formData.orderDate ? format(formData.orderDate, "dd/MM/yyyy") : "-"}</span>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <CustomSelect
                    value={formData.contactId}
                    label="Vendor"
                    onValueChange={(val) =>
                      setFormData((prev) => ({ ...prev, contactId: val }))
                    }
                    placeholder="Select Vendor"
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
                      label="Order Date"
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
                      label="Expected Date"
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
                        Department
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
                        placeholder="Default Budget"
                        disabled={isReadOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Project</label>
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
                        placeholder="Default Budget"
                        disabled={isReadOnly}
                      />
                    </div>
                  </div>
                </div>
                <CustomTextarea
                  value={formData.notes || ""}
                  label="Notes"
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
              </div>
            </CollapsibleSection>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Ordered Items</CardTitle>
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
                        <TableHead>Product</TableHead>
                        <TableHead className="w-[120px]">Order Qty</TableHead>
                        <TableHead className="w-[80px]">Unit</TableHead>
                        <TableHead className="w-[150px]">Price</TableHead>
                        <TableHead className="w-[140px]">Tax Rate</TableHead>
                        <TableHead className="w-[150px]">Total</TableHead>
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
                                placeholder="Select Product"
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
        </div>
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
    </div>
  );
}
