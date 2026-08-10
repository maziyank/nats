"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    EmploymentStatus,
    Gender,
    MaritalStatus,
    TaxFilingStatus,
} from "@/prisma/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { createEmployee, updateEmployee, getEmployeeOptions } from "../actions";
import { getDepartments } from "@/app/[locale]/(dashboard)/general/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import {
    PageFormLayout,
    PageFormHeader,
    PageFormTitle,
    PageFormActions,
    PageFormContent,
} from "@/components/layout/page/form-layout";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useTranslations } from "next-intl";

const employeeSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address").optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
    taxId: z.string().optional(),

    employeeNumber: z.string().optional(),
    joinDate: z.date(),
    employmentStatus: z.nativeEnum(EmploymentStatus),
    jobTitle: z.string().min(1, "Job title is required"),
    department: z.string().optional(),
    departmentId: z.string().optional(),
    managerId: z.string().optional(),
    isActive: z.boolean().optional(),

    dateOfBirth: z.date().optional(),
    gender: z.nativeEnum(Gender).optional(),
    maritalStatus: z.nativeEnum(MaritalStatus).optional(),
    nationalId: z.string().optional(),
    employeeTaxId: z.string().optional(),
    taxFilingStatus: z.nativeEnum(TaxFilingStatus).optional(),
    hasNpwp: z.boolean().optional(),

    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),

    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    bankHolder: z.string().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

interface EmployeeFormProps {
    initialData?: any;
    isEditing?: boolean;
    /** When false, form is read-only (view mode). Defaults to true. */
    canEdit?: boolean;
}

type DepartmentOption = { id: string; name: string; code?: string };
type ManagerOption = {
    id: string;
    name: string;
    employeeDetail?: { id: string; jobTitle?: string | null; department?: string | null } | null;
};

export function EmployeeForm({
    initialData,
    isEditing = false,
    canEdit = true,
}: EmployeeFormProps) {
    const t = useTranslations("HR");
    const tCommon = useTranslations("Common");
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [managers, setManagers] = useState<ManagerOption[]>([]);

    const detail = initialData?.employeeDetail;

    const defaultValues: Partial<EmployeeFormValues> = initialData
        ? {
            ...initialData,
            ...detail,
            employeeNumber: detail?.employeeNumber || "",
            departmentId: detail?.departmentId || "",
            department: detail?.department || "",
            managerId: detail?.managerId || "",
            taxFilingStatus: detail?.taxFilingStatus || TaxFilingStatus.TK0,
            hasNpwp: detail?.hasNpwp ?? true,
            isActive: initialData.isActive ?? true,
            joinDate: detail?.joinDate ? new Date(detail.joinDate) : new Date(),
            dateOfBirth: detail?.dateOfBirth ? new Date(detail.dateOfBirth) : undefined,
            employeeTaxId: detail?.taxId,
        }
        : {
            name: "",
            email: "",
            phone: "",
            address: "",
            taxId: "",
            employeeNumber: "",
            joinDate: new Date(),
            employmentStatus: EmploymentStatus.FULL_TIME,
            jobTitle: "",
            department: "",
            departmentId: "",
            managerId: "",
            taxFilingStatus: TaxFilingStatus.TK0,
            hasNpwp: true,
            isActive: true,
        };

    const form = useForm<EmployeeFormValues>({
        resolver: zodResolver(employeeSchema),
        defaultValues,
    });

    useEffect(() => {
        async function loadOptions() {
            try {
                const [deptResult, managerResult] = await Promise.all([
                    getDepartments(),
                    getEmployeeOptions(),
                ]);
                setDepartments(Array.isArray(deptResult) ? deptResult : []);
                if (managerResult.success && managerResult.data) {
                    const list = SuperJSON.deserialize<ManagerOption[]>(
                        managerResult.data as SuperJSONResult
                    );
                    setManagers(
                        list.filter((m) => !initialData?.id || m.id !== initialData.id)
                    );
                }
            } catch {
                // Options are non-critical; form still works with free-text department
            }
        }
        loadOptions();
    }, [initialData?.id]);

    async function onSubmit(data: EmployeeFormValues) {
        if (!canEdit) return;
        setIsLoading(true);
        try {
            const selectedDept = departments.find((d) => d.id === data.departmentId);
            const payload = {
                ...data,
                department: selectedDept?.name || data.department || "General",
                departmentId: data.departmentId || undefined,
                managerId: data.managerId || undefined,
                employeeNumber: data.employeeNumber || undefined,
            };

            const response = isEditing
                ? await updateEmployee(initialData.id, payload)
                : await createEmployee(payload);

            if (response.success) {
                toast({
                    title: isEditing ? t("employee_updated") : t("employee_created"),
                    description: isEditing
                        ? t("employee_updated_desc")
                        : t("employee_created_desc"),
                });
                if (!isEditing) {
                    const created = SuperJSON.deserialize<{ id: string }>(
                        response.data as SuperJSONResult
                    );
                    router.push(`/hr/employees/${created.id}`);
                } else {
                    router.refresh();
                }
            } else {
                toast({
                    variant: "destructive",
                    title: tCommon("error"),
                    description: response.error,
                });
            }
        } catch {
            toast({
                variant: "destructive",
                title: tCommon("error"),
                description: "Something went wrong. Please try again.",
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <PageFormLayout>
                    <PageFormHeader>
                        <PageFormTitle title={isEditing ? t("edit_employee") : t("new_employee")} />
                        <PageFormActions>
                            <Button variant="outline" type="button" onClick={() => router.back()}>
                                {tCommon("cancel")}
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isEditing ? t("update_employee") : t("create_employee")}
                            </Button>
                        </PageFormActions>
                    </PageFormHeader>

                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="general">{t("general_info")}</TabsTrigger>
                            <TabsTrigger value="employment">{t("employment")}</TabsTrigger>
                            <TabsTrigger value="personal">{t("personal_info")}</TabsTrigger>
                            <TabsTrigger value="bank">{t("bank_tax")}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="general">
                            <PageFormContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t("full_name")}</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="John Doe" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="employeeNumber"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t("employee_number")}</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="EMP-001" {...field} value={field.value || ""} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t("email")}</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="john@example.com" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="phone"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t("phone")}</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="+1234567890" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <FormField
                                    control={form.control}
                                    name="address"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("address")}</FormLabel>
                                            <FormControl>
                                                <Input placeholder="123 Main St" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {isEditing && (
                                    <FormField
                                        control={form.control}
                                        name="isActive"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center gap-3 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value ?? true}
                                                        onCheckedChange={(checked) =>
                                                            field.onChange(checked === true)
                                                        }
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">
                                                    {t("active")}
                                                </FormLabel>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </PageFormContent>
                        </TabsContent>

                        <TabsContent value="employment">
                            <Card>
                                <CardContent className="space-y-4 pt-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="jobTitle"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("job_title")}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Software Engineer" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="departmentId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("department")}</FormLabel>
                                                    <Select
                                                        onValueChange={(value) => {
                                                            field.onChange(value === "__none__" ? "" : value);
                                                            const dept = departments.find((d) => d.id === value);
                                                            if (dept) {
                                                                form.setValue("department", dept.name);
                                                            }
                                                        }}
                                                        value={field.value || "__none__"}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder={t("department")} />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="__none__">—</SelectItem>
                                                            {departments.map((dept) => (
                                                                <SelectItem key={dept.id} value={dept.id}>
                                                                    {dept.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    {!form.watch("departmentId") && (
                                        <FormField
                                            control={form.control}
                                            name="department"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("department")} (text)</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Engineering" {...field} value={field.value || ""} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="managerId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("manager")}</FormLabel>
                                                    <Select
                                                        onValueChange={(value) =>
                                                            field.onChange(value === "__none__" ? "" : value)
                                                        }
                                                        value={field.value || "__none__"}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder={t("manager")} />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="__none__">—</SelectItem>
                                                            {managers.map((m) => (
                                                                <SelectItem key={m.id} value={m.id}>
                                                                    {m.name}
                                                                    {m.employeeDetail?.jobTitle
                                                                        ? ` — ${m.employeeDetail.jobTitle}`
                                                                        : ""}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="employmentStatus"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("employment_status")}</FormLabel>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select status" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {Object.values(EmploymentStatus).map((status) => (
                                                                <SelectItem key={status} value={status}>
                                                                    {status.replace(/_/g, " ")}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name="joinDate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t("join_date")}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="date"
                                                        value={
                                                            field.value
                                                                ? new Date(field.value).toISOString().split("T")[0]
                                                                : ""
                                                        }
                                                        onChange={(e) =>
                                                            field.onChange(
                                                                e.target.value ? new Date(e.target.value) : undefined
                                                            )
                                                        }
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="personal">
                            <Card>
                                <CardContent className="space-y-4 pt-6">
                                    <div className="grid grid-cols-3 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="dateOfBirth"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("date_of_birth")}</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="date"
                                                            value={
                                                                field.value
                                                                    ? new Date(field.value).toISOString().split("T")[0]
                                                                    : ""
                                                            }
                                                            onChange={(e) =>
                                                                field.onChange(
                                                                    e.target.value
                                                                        ? new Date(e.target.value)
                                                                        : undefined
                                                                )
                                                            }
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="gender"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("gender")}</FormLabel>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select gender" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {Object.values(Gender).map((g) => (
                                                                <SelectItem key={g} value={g}>
                                                                    {g}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="maritalStatus"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("marital_status")}</FormLabel>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select status" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {Object.values(MaritalStatus).map((s) => (
                                                                <SelectItem key={s} value={s}>
                                                                    {s}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <Separator className="my-4" />
                                    <h4 className="text-sm font-medium">{t("emergency_contact")}</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="emergencyContactName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("name")}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Jane Doe" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="emergencyContactPhone"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("phone")}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="+1234567890" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="bank">
                            <Card>
                                <CardContent className="space-y-4 pt-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="nationalId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("national_id")}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="National ID" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="employeeTaxId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("tax_id")}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Tax ID" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="taxFilingStatus"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("tax_filing_status")}</FormLabel>
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        defaultValue={field.value || TaxFilingStatus.TK0}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder={t("tax_filing_status")} />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {Object.values(TaxFilingStatus).map((s) => (
                                                                <SelectItem key={s} value={s}>
                                                                    {s}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="hasNpwp"
                                            render={({ field }) => (
                                                <FormItem className="flex flex-row items-center gap-3 space-y-0 pt-8">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value ?? true}
                                                            onCheckedChange={(checked) =>
                                                                field.onChange(checked === true)
                                                            }
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                        {t("has_npwp")}
                                                    </FormLabel>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <Separator className="my-4" />
                                    <h4 className="text-sm font-medium">{t("bank_details")}</h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="bankName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("bank_name")}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Bank Name" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="bankAccount"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("account_number")}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Account Number" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="bankHolder"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>{t("account_holder")}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Account Holder" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </PageFormLayout>
            </form>
        </Form>
    );
}
