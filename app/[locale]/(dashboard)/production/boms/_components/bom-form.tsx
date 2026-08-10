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
import { Loader2, Plus, Trash2, SaveIcon, ArrowLeftSquare } from "lucide-react";
import { createBOM, updateBOM } from "../actions";
import { BillOfMaterialInput } from "../types";
import { generateId } from "@/services/lib/utils";
import { useAlert } from "@/hooks/use-alert";
import { SuperJSONResult } from "superjson";
import { SuperJSON } from "@/services/lib/superjson";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

interface ProductOption {
    id: string;
    name: string;
    sku: string;
}

interface BOMWithDetails {
    id: string;
    bomNumber: string;
    name: string;
    description: string | null;
    productId: string;
    quantity: number;
    isActive: boolean;
    items: {
        id: string;
        productId: string;
        quantity: number;
        unitCost: number | null;
        notes: string | null;
    }[];
}

interface BOMFormProps {
    bom?: SuperJSONResult;
    products: SuperJSONResult;
    readonly?: boolean;
}

export function BOMForm({
    bom: serializedBOM,
    products: serializedProducts,
    readonly = false,
}: BOMFormProps) {
    const t = useTranslations("Production");
    const tCommon = useTranslations("Common");
    const bom = serializedBOM
        ? SuperJSON.deserialize<BOMWithDetails>(serializedBOM)
        : undefined;
    const products = serializedProducts && "json" in serializedProducts
        ? SuperJSON.deserialize<ProductOption[]>(serializedProducts)
        : [];

    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const isEditing = !!bom;
    const alert = useAlert();

    const [formData, setFormData] = useState<
        Omit<BillOfMaterialInput, "items"> & {
            items: (BillOfMaterialInput["items"][0] & { id: string })[];
        }
    >({
        name: bom?.name || "",
        description: bom?.description || "",
        productId: bom?.productId || "",
        quantity: bom?.quantity || 1,
        isActive: bom?.isActive ?? true,
        items: bom?.items.map((item) => ({
            id: generateId(),
            productId: item.productId,
            quantity: Number(item.quantity),
            unitCost: item.unitCost ? Number(item.unitCost) : undefined,
            notes: item.notes || undefined,
        })) || [],
    });

    const handleAddItem = () => {
        if (readonly) return;
        setFormData((prev) => ({
            ...prev,
            items: [
                ...prev.items,
                { id: generateId(), productId: "", quantity: 1 },
            ],
        }));
    };

    const handleRemoveItem = (index: number) => {
        if (readonly) return;
        setFormData((prev) => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
        }));
    };

    const handleItemChange = (
        index: number,
        field: string,
        value: string | number | undefined,
    ) => {
        if (readonly) return;
        const newItems = [...formData.items];
        newItems[index] = { ...newItems[index], [field]: value };
        setFormData((prev) => ({ ...prev, items: newItems }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (readonly) return;

        if (!formData.name) {
            await alert({ title: tCommon("error"), description: "Name is required" });
            return;
        }
        if (!formData.productId) {
            await alert({ title: tCommon("error"), description: t("select_product") });
            return;
        }
        if (formData.items.length === 0) {
            await alert({ title: tCommon("error"), description: t("add_item") });
            return;
        }
        for (const item of formData.items) {
            if (!item.productId) {
                await alert({ title: tCommon("error"), description: t("select_product") });
                return;
            }
        }

        setIsLoading(true);
        try {
            const submissionData: BillOfMaterialInput = {
                ...formData,
                items: formData.items.map(({ id, ...item }) => item),
            };

            let result;
            if (isEditing && bom) {
                result = await updateBOM(bom.id, submissionData);
            } else {
                result = await createBOM(submissionData);
            }

            if (result.success) {
                router.push("/production/boms");
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

    const productOptions = products.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.sku})`,
    }));

    return (
        <div className="flex-1 space-y-4 px-4 pt-0">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight">
                    {bom ? `BOM ${bom.bomNumber}` : t("new_bom")}
                </h2>
                <div className="flex gap-2">
                    {!readonly && (
                        <Button type="submit" disabled={isLoading} onClick={handleSubmit}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {!isLoading && <SaveIcon className="mr-2 h-4 w-4" />}
                            {isEditing ? tCommon("save") : tCommon("create")}
                        </Button>
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
                                    <CustomInput
                                        label={t("name")}
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) =>
                                            setFormData((prev) => ({ ...prev, name: e.target.value }))
                                        }
                                        disabled={readonly}
                                        required
                                    />
                                    <div className="space-y-2">
                                        <Label>{t("product")}</Label>
                                        <SearchableSelect
                                            value={formData.productId}
                                            onValueChange={(val) =>
                                                setFormData((prev) => ({ ...prev, productId: val || "" }))
                                            }
                                            options={productOptions}
                                            placeholder={t("select_product")}
                                            disabled={readonly}
                                        />
                                    </div>
                                    <CustomInput
                                        label={t("quantity")}
                                        id="quantity"
                                        type="number"
                                        min="1"
                                        value={formData.quantity}
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                quantity: Number(e.target.value),
                                            }))
                                        }
                                        disabled={readonly}
                                    />
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="isActive"
                                            checked={formData.isActive}
                                            onCheckedChange={(val) =>
                                                setFormData((prev) => ({ ...prev, isActive: val }))
                                            }
                                            disabled={readonly}
                                        />
                                        <Label htmlFor="isActive">{t("is_active")}</Label>
                                    </div>
                                </div>
                                <CustomTextarea
                                    value={formData.description || ""}
                                    label={t("description")}
                                    className="resize-none"
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            description: e.target.value,
                                        }))
                                    }
                                    disabled={readonly}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>{t("items")}</CardTitle>
                            {!readonly && (
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
                                        <TableHead className="w-[150px]">{t("unit_cost")}</TableHead>
                                        <TableHead className="w-[200px]">{t("notes")}</TableHead>
                                        {!readonly && <TableHead className="w-[50px]"></TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {formData.items.map((item, index) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <SearchableSelect
                                                    value={item.productId}
                                                    onValueChange={(val) =>
                                                        handleItemChange(index, "productId", val || "")
                                                    }
                                                    options={productOptions}
                                                    placeholder={t("select_product")}
                                                    disabled={readonly}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <CustomInput
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    value={item.quantity}
                                                    onChange={(e) =>
                                                        handleItemChange(index, "quantity", Number(e.target.value))
                                                    }
                                                    disabled={readonly}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <CurrencyInput
                                                    value={item.unitCost || 0}
                                                    onChange={(val) =>
                                                        handleItemChange(index, "unitCost", Number(val))
                                                    }
                                                    disabled={readonly}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <CustomInput
                                                    value={item.notes || ""}
                                                    onChange={(e) =>
                                                        handleItemChange(index, "notes", e.target.value)
                                                    }
                                                    disabled={readonly}
                                                />
                                            </TableCell>
                                            {!readonly && (
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
                                    ))}
                                    {formData.items.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={readonly ? 4 : 5} className="text-center text-muted-foreground py-8">
                                                {t("no_boms_found")}
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
