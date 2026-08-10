'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CustomInput } from '@/components/ui/custom-input';
import { CustomSelect } from '@/components/ui/custom-select';
import { SelectItem } from '@/components/ui/select';
import { DiscountType } from '@/prisma/generated/prisma/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getGlobalDiscounts,
  createGlobalDiscount,
  updateGlobalDiscount,
  deleteGlobalDiscount,
  toggleDiscountStatus,
} from '../actions';
import { SuperJSON } from '@/services/lib/superjson';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import { useFormatDate } from "@/hooks/use-format-date";
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function GlobalDiscountManager() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<any>(null);
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();
  const { toast } = useToast();

  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ['global-discounts'],
    queryFn: async () => {
      const res = await getGlobalDiscounts();
      return SuperJSON.deserialize<any[]>(res);
    },
  });

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this discount?')) return;
    try {
      const res = await deleteGlobalDiscount(id);
      if (res.success) {
        toast({ title: 'Discount deleted' });
        queryClient.invalidateQueries({ queryKey: ['global-discounts'] });
      } else {
        toast({ variant: 'destructive', title: res.error });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    try {
      const res = await toggleDiscountStatus({ discountId: id, isActive });
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['global-discounts'] });
        toast({ title: isActive ? 'Discount activated' : 'Discount deactivated' });
      } else {
        toast({ variant: 'destructive', title: res.error });
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium">Global Discounts</h2>
          <p className="text-sm text-muted-foreground">
            Manage store-wide discount codes that apply to the entire cart.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Global Discount
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Min Qty</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : discounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No global discounts found.
                  </TableCell>
                </TableRow>
              ) : (
                discounts.map((discount) => (
                  <TableRow key={discount.id} className={!discount.isActive ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">
                      {discount.code}
                      {discount.description && (
                        <div className="text-xs text-muted-foreground">{discount.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{discount.type}</Badge>
                    </TableCell>
                    <TableCell>
                      {discount.type === 'PERCENTAGE'
                        ? `${Number(discount.value)}%`
                        : formatCurrency(Number(discount.value))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={discount.isActive ? 'default' : 'secondary'}>
                        {discount.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>Start: {formatDate(discount.startDate)}</div>
                      {discount.endDate && (
                        <div className="text-muted-foreground">
                          End: {formatDate(discount.endDate)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{discount.minQuantity || '-'}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setEditingDiscount(discount)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(discount.id, !discount.isActive)}>
                            {discount.isActive ? (
                              <>
                                <EyeOff className="mr-2 h-4 w-4" /> Deactivate
                              </>
                            ) : (
                              <>
                                <Eye className="mr-2 h-4 w-4" /> Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => handleDelete(discount.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DiscountFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={() => {
          setIsCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ['global-discounts'] });
        }}
      />

      {editingDiscount && (
        <DiscountFormDialog
          open={!!editingDiscount}
          onOpenChange={(open) => !open && setEditingDiscount(null)}
          initialData={editingDiscount}
          onSuccess={() => {
            setEditingDiscount(null);
            queryClient.invalidateQueries({ queryKey: ['global-discounts'] });
          }}
        />
      )}
    </div>
  );
}

interface DiscountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: any;
  onSuccess: () => void;
}

function DiscountFormDialog({ open, onOpenChange, initialData, onSuccess }: DiscountFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [code, setCode] = useState(initialData?.code || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [type, setType] = useState<DiscountType>(initialData?.type || 'PERCENTAGE');
  const [value, setValue] = useState(initialData?.value ? String(initialData.value) : '');
  const [startDate, setStartDate] = useState(
    initialData?.startDate
      ? new Date(initialData.startDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    initialData?.endDate ? new Date(initialData.endDate).toISOString().split('T')[0] : ''
  );
  const [minQuantity, setMinQuantity] = useState(initialData?.minQuantity ? String(initialData.minQuantity) : '');
  const [priority, setPriority] = useState(initialData?.priority ? String(initialData.priority) : '0');

  const handleSubmit = async () => {
    if (!code || !value || !startDate) {
      toast({ variant: 'destructive', title: 'Missing required fields' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        code,
        description,
        type,
        value: Number(value),
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
        minQuantity: minQuantity ? Number(minQuantity) : undefined,
        priority: Number(priority),
      };

      let res;
      if (initialData) {
        res = await updateGlobalDiscount({
          id: initialData.id,
          isActive: initialData.isActive,
          ...payload,
        });
      } else {
        res = await createGlobalDiscount(payload);
      }

      if (res.success) {
        toast({ title: initialData ? 'Discount updated' : 'Discount created' });
        onSuccess();
      } else {
        toast({ variant: 'destructive', title: res.error });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'An error occurred' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Global Discount' : 'Create Global Discount'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <CustomInput
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. SUMMER2025"
            containerClassName="space-y-2"
          />
          <CustomInput
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            containerClassName="space-y-2"
          />
          <div className="grid grid-cols-2 gap-4">
            <CustomSelect
              label="Type"
              value={type}
              onValueChange={(v) => setType(v as DiscountType)}
              containerClassName="space-y-2"
            >
              <SelectItem value="PERCENTAGE">Percentage</SelectItem>
              <SelectItem value="FIXED_AMOUNT">Fixed Amount</SelectItem>
            </CustomSelect>
            <CustomInput
              label="Value"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="10"
              containerClassName="space-y-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CustomInput
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              containerClassName="space-y-2"
            />
            <CustomInput
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="Optional"
              containerClassName="space-y-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CustomInput
              label="Min Quantity"
              type="number"
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              placeholder="Optional"
              containerClassName="space-y-2"
            />
            <CustomInput
              label="Priority"
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              placeholder="0"
              containerClassName="space-y-2"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
