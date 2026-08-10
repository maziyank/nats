'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { openPOSSession } from '../actions';
import { useToast } from '@/hooks/use-toast';
import { DoorClosedIcon, Link, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useTranslations } from 'next-intl';

interface POSSessionDialogProps {
  warehouses: SuperJSONResult;
  departments?: SuperJSONResult;
}

export function POSSessionDialog({
  warehouses: serializedWarehouses,
  departments: serializedDepartments,
}: POSSessionDialogProps) {
  const t = useTranslations('POS');
  const warehouses = SuperJSON.deserialize<any[]>(serializedWarehouses);
  const departments = serializedDepartments
    ? SuperJSON.deserialize<any[]>(serializedDepartments)
    : [];
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const { toast } = useToast();
  const router = useRouter();

  const handleOpenSession = async (formData: FormData) => {
    setLoading(true);
    try {
      const openingCash = parseFloat(formData.get('openingCash') as string);
      const selectedWarehouseId = formData.get('warehouseId') as string;
      const selectedDepartmentId = (formData.get('departmentId') as string) || null;

      if (isNaN(openingCash) || openingCash < 0) {
        toast({
          variant: 'destructive',
          title: t('invalid_amount'),
          description: t('invalid_amount_desc'),
        });
        setLoading(false);
        return;
      }

      if (!selectedWarehouseId) {
        toast({
          variant: 'destructive',
          title: t('warehouse_required'),
          description: t('warehouse_required_desc'),
        });
        setLoading(false);
        return;
      }

      // Department tag is optional — only pass it through when selected.
      await openPOSSession(
        openingCash,
        selectedWarehouseId,
        selectedDepartmentId || undefined,
      );

      toast({
        title: t('session_opened'),
        description: t('session_opened_desc'),
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error(error);
      // Surface a dedicated message when the backend rejects the department tag.
      const message = error instanceof Error ? error.message : "";
      const isDepartmentError = /department/i.test(message);
      toast({
        variant: 'destructive',
        title: isDepartmentError ? t('department_invalid') : t('error'),
        description: isDepartmentError
          ? t('department_invalid_desc')
          : t('error_open_session'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="w-full">{t('start_shift')}</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('start_pos_session')}</DialogTitle>
            <DialogDescription>
              {t('session_description')}
            </DialogDescription>
          </DialogHeader>
          <form action={handleOpenSession}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="warehouse" className="text-right">
                  {t('location')}
                </Label>
                <div className="col-span-3">
                  <input type="hidden" name="warehouseId" value={warehouseId} />
                  <Select onValueChange={setWarehouseId} value={warehouseId}>
                    <SelectTrigger id="warehouse">
                      <SelectValue placeholder={t('select_location')} />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="department" className="text-right">
                  {t('department')}
                </Label>
                <div className="col-span-3">
                  <input type="hidden" name="departmentId" value={departmentId} />
                  <Select onValueChange={setDepartmentId} value={departmentId}>
                    <SelectTrigger id="department">
                      <SelectValue placeholder={t('select_department')} />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="openingCash" className="text-right">
                  {t('opening_cash')}
                </Label>
                <Input
                  id="openingCash"
                  name="openingCash"
                  type="number"
                  step="0.01"
                  defaultValue="0.00"
                  className="col-span-3"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('open_session')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className='w-full'>
        <Button variant="outline" size="lg" className="w-full" onClick={() => router.push('/')}>
          <DoorClosedIcon className="mr-2 h-4 w-4" />
          {t('return_dashboard')}
        </Button>
      </div>
    </>
  );
}
