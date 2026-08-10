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
import { Loader2, Plus, Trash2, SaveIcon, ArrowLeftSquare, Package, XCircle } from "lucide-react";
import { createProductionIssue, issueMaterials, cancelProductionIssue } from "../actions";
import { ProductionIssueInput } from "../types";
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

interface IssueWithDetails {
    id: string;
    issueNumber: string;
    productionOrderId: string;
    issueDate: Date;
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

interface ProductionIssueFormProps {
    issue?: SuperJSONResult;
    products: SuperJSONResult;
    orders: SuperJSONResult;
    readonly?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
    DRAFT: "bg-gray-500",
    ISSUED: "bg-green-500",
    CANCELLED: "bg-red-500",
};

export function ProductionIssueForm({
    issue: serializedIssue,
    products: serializedProducts,
    orders: serializedOrders,
    readonly = false,
}: ProductionIssueFormProps) {
    const t = useTranslations("Production");
    const tCommon = useTranslations("Common");
    const issue = serializedIssue
        ? SuperJSON.deserialize<IssueWithDetails>(serializedIssue)
        : undefined;
    const products = serializedProducts && "json" in serializedProducts
        ? SuperJSON.deserialize<ProductOption[]>(serializedProducts)
        : [];
    const orders = serializedOrders && "json" in serializedOrders
        ? SuperJSON.deserialize<OrderOption[]>(serializedOrders)
        : [];

    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const isDraft = issue?.status === "DRAFT" || !issue;
    const isReadOnly = readonly || !isDraft;
    const alert = useAlert();
    const confirm = useConfirm();
    const formatCurrency = useFormatCurrency();

    const [formData, setFormData] = useState<
        Omit<ProductionIssueInput, "items"> & {
            items: (ProductionIssueInput["items"][0] & { id: string })[];
        }
    >({
        productionOrderId: issue?.productionOrderId || "",
        issueDate: issue?.issueDate ? new Date(issue.issueDate) : new Date(),
        notes: issue?.notes || undefined,
        items: issue?.items.map((item) => ({
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
            const submissionData: ProductionIssueInput = {
                ...formData,
                items: formData.items.map(({ id, ...item }) => item),
            };
            const result = await createProductionIssue(submissionData);
            if (result.success) {
                router.push("/production/issues");
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

    const handleIssueMaterials = async () => {
        if (!issue) return;
        if (await confirm({ title: t("issue_materials"), description: "Issue materials from inventory? This will deduct stock." })) {
            setIsLoading(true);
            try {
                const result = await issueMaterials(issue.id);
                if (!result.success)
                    await alert({ title: tCommon("error"), description: result.error });
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleCancel = async () => {
        if (!issue) return;
        if (await confirm({ title: t("cancel"), description: "Cancel this production issue?", variant: "destructive" })) {
            setIsLoading(true);
            try {
                const result = await cancelProductionIssue(issue.id);
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
                        {issue ? `${t("issue_number")} ${issue.issueNumber}` : t("new_issue")}
                    </h2>
                    {issue && (
                        <Badge className={STATUS_COLORS[issue.status] || "bg-gray-500"}>
                            {issue.status}
                        </Badge>
                    )}
                </div>
                <div className="flex gap-2">
                    {isDraft && !readonly && !issue && (
                        <Button type="submit" disabled={isLoading} onClick={handleSubmit}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {!isLoading && <SaveIcon className="mr-2 h-4 w-4" />}
                            {tCommon("create")}
                        </Button>
                    )}
                    {issue?.status === "DRAFT" && !readonly && (
                        <>
                            <Button type="button" onClick={handleIssueMaterials} disabled={isLoading}>
                                <Package className="mr-2 h-4 w-4" />
                                {t("issue_materials")}
                            </Button>
                            <Button type="button" variant="destructive" onClick={handleCancel} disabled={isLoading}>
                                <XCircle className="mr-2 h-4 w-4" />
                                {t("cancel")}
                            </Button>
                        </>
                    )}
                    <Button type="button" variant="outline"  onClick={() => router.back()}>
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
                                        label={t("issue_date")}
                                        id="issueDate"
                                        value={format(formData.issueDate, "yyyy-MM-dd")}
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                issueDate: e.target.value ? new Date(e.target.value) : new Date(),
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
                                        {issue && <TableHead className="w-[150px]">{t("unit_cost")}</TableHead>}
                                        {issue && <TableHead className="w-[150px]">{t("total_cost")}</TableHead>}
                                        {!isReadOnly && <TableHead className="w-[50px]"></TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {formData.items.map((item, index) => {
                                        const originalItem = issue?.items[index];
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
                                                {issue && (
                                                    <TableCell>
                                                        <div className="flex h-10 items-center text-sm">
                                                            {formatCurrency(Number(originalItem?.unitCost || 0))}
                                                        </div>
                                                    </TableCell>
                                                )}
                                                {issue && (
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
                                                {t("no_issues_found")}
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
