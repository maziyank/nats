
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBudget, updateBudget } from "@/app/[locale]/(dashboard)/budgeting/actions";
import { Department, Project, Account } from "@/prisma/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomTextarea } from "@/components/ui/custom-textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  PageFormLayout,
  PageFormHeader,
  PageFormTitle,
  PageFormActions,
  PageFormContent,
} from "@/components/layout/page/form-layout";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateId, formatCurrency } from "@/services/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface BudgetItemData {
  id?: string;
  accountId: string;
  totalAmount: number;
  january: number;
  february: number;
  march: number;
  april: number;
  may: number;
  june: number;
  july: number;
  august: number;
  september: number;
  october: number;
  november: number;
  december: number;
}

interface BudgetFormData {
  id?: string;
  name: string;
  fiscalYear: number;
  description?: string;
  departmentId?: string | null;
  projectId?: string | null;
  isDefault: boolean;
  totalAmount: number;
  items: BudgetItemData[];
}

import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useMemo } from "react";

// ... existing imports ...

interface BudgetFormProps {
  departments: SuperJSONResult;
  projects: SuperJSONResult;
  accounts: SuperJSONResult;
  initialData?: any;
  isEdit?: boolean;
}

export function BudgetForm({ departments: departmentsData, projects: projectsData, accounts: accountsData, initialData, isEdit }: BudgetFormProps) {
  const departments = useMemo(() => SuperJSON.deserialize<Department[]>(departmentsData) || [], [departmentsData]);
  const projects = useMemo(() => SuperJSON.deserialize<Project[]>(projectsData) || [], [projectsData]);
  const accounts = useMemo(() => SuperJSON.deserialize<Account[]>(accountsData) || [], [accountsData]);

  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<BudgetFormData>(() => {
    if (initialData) {
      return {
        ...initialData,
        departmentId: initialData.departmentId || null,
        projectId: initialData.projectId || null,
        isDefault: initialData.isDefault || false,
        totalAmount: Number(initialData.totalAmount) || 0,
        items: initialData.items?.map((item: any) => ({
          ...item,
          totalAmount: Number(item.totalAmount),
          january: Number(item.january),
          february: Number(item.february),
          march: Number(item.march),
          april: Number(item.april),
          may: Number(item.may),
          june: Number(item.june),
          july: Number(item.july),
          august: Number(item.august),
          september: Number(item.september),
          october: Number(item.october),
          november: Number(item.november),
          december: Number(item.december),
        })) || [],
      };
    }
    return {
      name: "",
      fiscalYear: new Date().getFullYear() + 1,
      description: "",
      departmentId: null,
      projectId: null,
      isDefault: false,
      totalAmount: 0,
      items: [],
    };
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.name) {
      toast({ title: "Error", description: "Budget name is required", variant: "destructive" });
      setLoading(false);
      return;
    }

    const dataToSubmit = {
      ...formData,
      departmentId: formData.isDefault ? null : (formData.departmentId || null),
      projectId: formData.isDefault ? null : (formData.projectId || null),
      isDefault: formData.isDefault,
      totalAmount: formData.totalAmount,
    };

    try {
      if (isEdit && formData.id) {
        await updateBudget(formData.id, dataToSubmit);
        toast({ title: "Budget updated", description: "Your budget has been updated successfully." });
      } else {
        await createBudget(dataToSubmit);
        toast({ title: "Budget created", description: "Your budget has been created successfully." });
      }
      router.push("/budgeting");
      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast({ title: "Error", description: error.message || "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (index: number, field: keyof BudgetItemData, value: any) => {
    // Handle NaN from CurrencyInput when field is empty
    const safeValue = (typeof value === 'number' && isNaN(value)) ? 0 : value;

    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: safeValue };

    // Recalculate total if a month changed
    if (field !== "accountId" && field !== "totalAmount" && field !== "id") {
      const item = newItems[index];
      const total =
        (Number(item.january) || 0) +
        (Number(item.february) || 0) +
        (Number(item.march) || 0) +
        (Number(item.april) || 0) +
        (Number(item.may) || 0) +
        (Number(item.june) || 0) +
        (Number(item.july) || 0) +
        (Number(item.august) || 0) +
        (Number(item.september) || 0) +
        (Number(item.october) || 0) +
        (Number(item.november) || 0) +
        (Number(item.december) || 0);
      newItems[index].totalAmount = total;
    }

    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          id: generateId(),
          accountId: "",
          totalAmount: 0,
          january: 0, february: 0, march: 0, april: 0, may: 0, june: 0,
          july: 0, august: 0, september: 0, october: 0, november: 0, december: 0
        },
      ],
    });
  };

  const removeItem = (index: number) => {
    const newItems = [...formData.items];
    newItems.splice(index, 1);
    setFormData({ ...formData, items: newItems });
  };

  const totalBudget = formData.items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);

  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  const postingAccounts = accounts.filter((acc) => acc.isPosting);

  return (
    <PageFormLayout>
      <PageFormHeader>
        <PageFormTitle>
          {isEdit ? "Edit Budget" : "Create New Budget"}
        </PageFormTitle>
        <PageFormActions>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
          >
            <Save className="mr-2 h-4 w-4" />
            {loading ? "Saving..." : "Save Budget"}
          </Button>
        </PageFormActions>
      </PageFormHeader>

      <PageFormContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CustomInput
              label="Budget Name"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. 2026 Marketing Budget"
              required
            />
            <CustomInput
              label="Fiscal Year"
              id="fiscalYear"
              type="number"
              value={formData.fiscalYear}
              onChange={(e) => setFormData({ ...formData, fiscalYear: parseInt(e.target.value) || 0 })}
              required
            />

            <div className="col-span-1 md:col-span-2 flex items-center space-x-2 border p-4 rounded-md bg-muted/20">
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({
                  ...formData,
                  isDefault: checked,
                  departmentId: checked ? null : formData.departmentId,
                  projectId: checked ? null : formData.projectId
                })}
              />
              <div className="space-y-1">
                <Label htmlFor="isDefault" className="font-medium">Default / Global Budget</Label>
                <p className="text-xs text-muted-foreground">
                  Check this to make this the default budget for transactions not explicitly linked to any department or project.
                </p>
              </div>
            </div>

            <CustomInput
              label="Global Allocation Limit"
              id="totalAmount"
              type="number"
              value={formData.totalAmount}
              onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />

            <div className="space-y-1">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Department (Optional)</label>
              <SearchableSelect
                value={formData.departmentId || ""}
                onValueChange={(val) => setFormData({ ...formData, departmentId: val })}
                options={departments.map(d => ({ value: d.id, label: d.name }))}
                placeholder="Select Department"
                disabled={formData.isDefault}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Project (Optional)</label>
              <SearchableSelect
                value={formData.projectId || ""}
                onValueChange={(val) => setFormData({ ...formData, projectId: val })}
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                placeholder="Select Project"
                disabled={formData.isDefault}
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <CustomTextarea
                label="Description"
                id="description"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Budget description..."
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Budget Items</h3>
              <Button type="button" onClick={addItem} variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" /> Add Item
              </Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[250px] sticky left-0 z-10 bg-background shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Account</TableHead>
                    <TableHead className="min-w-[120px] text-right">Total</TableHead>
                    {months.map((month) => (
                      <TableHead key={month} className="min-w-[100px] capitalize text-right">
                        {month.substring(0, 3)}
                      </TableHead>
                    ))}
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formData.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-muted-foreground h-24">
                        No items added. Click &quot;Add Item&quot; to start planning.
                      </TableCell>
                    </TableRow>
                  ) : (
                    formData.items.map((item, index) => (
                      <TableRow key={item.id || index}>
                        <TableCell className="sticky left-0 z-10 bg-background p-2 min-w-[250px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          <SearchableSelect
                            value={item.accountId}
                            onValueChange={(val) => updateItem(index, "accountId", val || "")}
                            options={postingAccounts.map(acc => ({ value: acc.id, label: `${acc.code} - ${acc.name}` }))}
                            placeholder="Select Account"
                            className="w-full border-0 shadow-none bg-transparent focus:ring-0"
                          />
                        </TableCell>
                        <TableCell className="p-2 min-w-[120px]">
                          <div className="font-bold text-right px-3 py-2 text-sm">
                            {formatCurrency(item.totalAmount)}
                          </div>
                        </TableCell>
                        {months.map((month) => (
                          <TableCell key={month} className="p-0 min-w-[100px] border-r border-dashed last:border-r-0">
                            <CurrencyInput
                              value={item[month as keyof BudgetItemData] as number}
                              onChange={(val) => updateItem(index, month as keyof BudgetItemData, val)}
                              className="w-full h-full min-h-[40px] border-0 rounded-none shadow-none text-right px-2 focus-visible:ring-0 focus-visible:bg-accent/10 transition-colors"
                              placeholder="0.00"
                              onFocus={(e) => e.target.select()}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="p-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(index)}
                            className="h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="sticky left-0 z-10 bg-muted/50 font-bold shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Total Budget</TableCell>
                    <TableCell className="font-bold text-right px-4">
                      {formatCurrency(totalBudget)}
                    </TableCell>
                    {months.map((month) => {
                      const monthTotal = formData.items.reduce((sum, item) => sum + (Number(item[month as keyof BudgetItemData]) || 0), 0);
                      return (
                        <TableCell key={month} className="font-bold text-right px-2">
                          {formatCurrency(monthTotal)}
                        </TableCell>
                      );
                    })}
                    <TableCell></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        </form>
      </PageFormContent>
    </PageFormLayout>
  );
}
