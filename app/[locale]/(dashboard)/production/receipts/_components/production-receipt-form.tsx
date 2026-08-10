"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomTextarea } from "@/components/ui/custom-textarea";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2, SaveIcon, ArrowLeftSquare, PackageCheck, XCircle } from "lucide-react";
import { createProductionReceipt, receiveGoods, cancelProductionReceipt } from "../actions";
import { ProductionReceiptInput } from "../types";
import { generateId } from "@/services/lib/utils";
import { useAlert } from "@/hooks/use-alert";
import { useConfirm } from "@/hooks/use-confirm";
import { SuperJSONResult } from "superjson";
import { SuperJSON } from "@/services/lib/superjson";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useFormatCurrency } from "@/hooks";
import { useTranslations } from "next-intl";

interface ProductOption {
    id: string;
    name: string;
    sku: string;
}

interface OrderOption {
    id: string;
    orderNumber: string;
    productId: string;
    status: string;
}

interface ReceiptWithDetails {
    id: string;
    receiptNumber: string;
    productionOrderId: string;
    receiptDate: Date;
    notes: string | null;
    status: string;
    items: {
        id: string;
        productId: string;
        quantity: number;
        unitCost: number | null;
        totalCost: number | null;
    }[];
}

interface ProductionReceiptFormProps {
    receipt?: SuperJSONResult;
    products: SuperJSONResult;
    orders: SuperJSONResult;
    readonly?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
    DRAFT: "bg-gray-500",
    RECEIVED: "bg-green-500",
    CANCELLED: "bg-red-500",
};

export function ProductionReceiptForm({
    receipt: serializedReceipt,
    products: serializedProducts,
    orders: serializedOrders,
    readonly = false,
}: ProductionReceiptFormProps) {
    const t = useTranslations("Production");
    const tCommon = useTranslations("Common");
    const receipt = serializedReceipt
        ? SuperJSON.deserialize<ReceiptWithDetails>(serializedReceipt)
        : undefined;
    const products = serializedProducts && "json" in serializedProducts
        ? SuperJSON.deserialize<ProductOption[]>(serializedProducts)
        : [];
    const orders = serializedOrders && "json" in serializedOrders
        ? SuperJSON.deserialize<OrderOption[]>(serializedOrders)
        : [];

    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const isDraft = receipt?.status === "DRAFT" || !receipt;
    const isReadOnly = readonly || !isDraft;
    const alert = useAlert();
    const confirm = useConfirm();
    const formatCurrency = useFormatCurrency();

    const [formData, setFormData] = useState<
        Omit<ProductionReceiptInput, "items"> & {
            items: (ProductionReceiptInput["items"][0] & { id: string })[];
        }
    >({
        productionOrderId: receipt?.productionOrderId || "",
        receiptDate: receipt?.receiptDate ? new Date(receipt.receiptDate) : new Date(),
        notes: receipt?.notes || undefined,
        items: receipt?.items.map((item) => ({
            id: generateId(),
            productId: item.productId,
            quantity: Number(item.quantity),
        })) || [],
    });

    const handleAddItem = () => {
        if (isReadOnly) return;
        setFormData((prev) => ({
            ...prev,
            items: [...prev.items, { id: generateId(), productId: "", quantity: 1 }],
        }));
    };

    const handleRemoveItem = (index: number) => {
        if (isReadOnly) return;
        setFormData((prev) => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
        }));
    };

    const handleItemChange = (index: number, field: string, value: string | number) => {
        if (isReadOnly) return;
        const newItems = [...formData.items];
        newItems[index] = { ...newItems[index], [field]: value };
        setFormData((prev) => ({ ...prev, items: newItems }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isReadOnly) return;

        if (!formData.productionOrderId) {
            await alert({ title: tCommon("error"), description: t("select_order") });
            return;
        }
        if (formData.items.length === 0) {
            await alert({ title: tCommon("error"), description: t("add_item") });
            return;
        }

        setIsLoading(true);
        try {
            const submissionData: ProductionReceiptInput = {
                ...formData,
                items: formData.items.map(({ id, ...item }) => item),
            };
            const result = await createProductionReceipt(submissionData);
            if (result.success) {
                router.push("/production/receipts");
            } else {
                await alert({ title: tCommon("error"), description: result.error });
            }
        } catch (error) {
            console.error(error);
            await alert({ title: tCommon("error"), description: t("create_error") });
        } finally {
            setIsLoading(false);
        }
    };

    const handleReceiveGoods = async () => {
        if (!receipt) return;
        if (await confirm({ title: t("receive_goods"), description: "Receive finished goods into inventory? This will increase stock." })) {
            setIsLoading(true);
            try {
                const result = await receiveGoods(receipt.id);
                if (!result.success)
                    await alert({ title: tCommon("error"), description: result.error });
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleCancel = async () => {
        if (!receipt) return;
        if (await confirm({ title: t("cancel"), description: "Cancel this production receipt?", variant: "destructive" })) {
            setIsLoading(true);
            try {
                const result = await cancelProductionReceipt(receipt.id);
                if (!result.success)
                    await alert({ title: tCommon("error"), description: result.error });
            } finally {
                setIsLoading(false);
            }
        }
    };

    const productOptions = products.map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }));
    const orderOptions = orders
        .filter((o) => o.status === "RELEASED" || o.status === "IN_PROGRESS")
        .map((o) => ({ value: o.id, label: o.orderNumber }));

    return (
        <div className="flex-1 space-y-4 px-4 pt-0">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold tracking-tight">
                        {receipt ? `${t("receipt_number")} ${receipt.receiptNumber}` : t("new_receipt")}
                    </h2>
                    {receipt && (
                        <Badge className={STATUS_COLORS[receipt.status] || "bg-gray-500"}>
                            {receipt.status}
                        </Badge>
                    )}
                </div>
                <div className="flex gap-2">
                    {isDraft && !readonly && !receipt && (
                        <Button type="submit" disabled={isLoading} onClick={handleSubmit}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {!isLoading && <SaveIcon className="mr-2 h-4 w-4" />}
                            {tCommon("create")}
                        </Button>
                    )}
                    {receipt?.status === "DRAFT" && !readonly && (
                        <>
                            <Button type="button" onClick={handleReceiveGoods} disabled={isLoading}>
                                <PackageCheck className="mr-2 h-4 w-4" />
                                {t("receive_goods")}
                            </Button>
                            <Button type="button" variant="destructive" onClick={handleCancel} disabled={isLoading}>
                                <XCircle className="mr-2 h-4 w-4" />
                                {t("cancel")}
                            </Button>
                        </>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
                        <ArrowLeftSquare className="mr-2 h-4 w-4" />
                        {tCommon("back")}
                    </Button>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid gap-4">
                    <Card>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>{t("order_number")}</Label>
                                        <SearchableSelect
                                            value={formData.productionOrderId}
                                            onValueChange={(val) =>
                                                setFormData((prev) => ({ ...prev, productionOrderId: val || "" }))
                                            }
                                            options={orderOptions}
                                            placeholder={t("select_order")}
                                            disabled={isReadOnly}
                                        />
                                    </div>
                                    <CustomInput
                                        type="date"
                                        label={t("receipt_date")}
                                        id="receiptDate"
                                        value={format(formData.receiptDate, "yyyy-MM-dd")}
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                receiptDate: e.target.value ? new Date(e.target.value) : new Date(),
                                            }))
                                        }
                                        disabled={isReadOnly}
                                    />
                                </div>
                                <CustomTextarea
                                    value={formData.notes || ""}
                                    label={t("notes")}
                                    className="resize-none"
                                    onChange={(e) =>
                                        setFormData((prev) => ({ ...prev, notes: e.target.value }))
                                    }
                                    disabled={isReadOnly}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>{t("items")}</CardTitle>
                            {!isReadOnly && (
                                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    {t("add_item")}
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t("product")}</TableHead>
                                        <TableHead className="w-[120px]">{t("quantity")}</TableHead>
                                        {receipt && <TableHead className="w-[150px]">{t("unit_cost")}</TableHead>}
                                        {receipt && <TableHead className="w-[150px]">{t("total_cost")}</TableHead>}
                                        {!isReadOnly && <TableHead className="w-[50px]"></TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {formData.items.map((item, index) => {
                                        const originalItem = receipt?.items[index];
                                        return (
                                            <TableRow key={item.id}>
                                                <TableCell>
                                                    <SearchableSelect
                                                        value={item.productId}
                                                        onValueChange={(val) =>
                                                            handleItemChange(index, "productId", val || "")
                                                        }
                                                        options={productOptions}
                                                        placeholder={t("select_product")}
                                                        disabled={isReadOnly}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <CustomInput
                                                        type="number"
                                                        min="1"
                                                        value={item.quantity}
                                                        onChange={(e) =>
                                                            handleItemChange(index, "quantity", Number(e.target.value))
                                                        }
                                                        disabled={isReadOnly}
                                                    />
                                                </TableCell>
                                                {receipt && (
                                                    <TableCell>
                                                        <div className="flex h-10 items-center text-sm">
                                                            {formatCurrency(Number(originalItem?.unitCost || 0))}
                                                        </div>
                                                    </TableCell>
                                                )}
                                                {receipt && (
                                                    <TableCell>
                                                        <div className="flex h-10 items-center text-sm font-medium">
                                                            {formatCurrency(Number(originalItem?.totalCost || 0))}
                                                        </div>
                                                    </TableCell>
                                                )}
                                                {!isReadOnly && (
                                                    <TableCell>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleRemoveItem(index)}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-red-500" />
                                                        </Button>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        );
                                    })}
                                    {formData.items.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                                {t("no_receipts_found")}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </form>
        </div>
    );
}
