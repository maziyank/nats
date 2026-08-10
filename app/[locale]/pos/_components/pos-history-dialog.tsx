'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPOSSessionTransactions } from '../actions';
import { SuperJSON } from '@/services/lib/superjson';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer, Loader2 } from 'lucide-react';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import { useFormatDate } from '@/hooks/use-format-date';
import { ReportPreviewDialog } from "@/app/[locale]/(dashboard)/reporting/_components/report-preview-dialog";
import { useTranslations } from 'next-intl';

interface POSHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  onRowClick?: (invoiceId: string) => void;
}

export function POSHistoryDialog({ open, onOpenChange, sessionId, onRowClick }: POSHistoryDialogProps) {
  const t = useTranslations('POS');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['pos-transactions', sessionId],
    queryFn: async () => {
      const res = await getPOSSessionTransactions(sessionId);
      return SuperJSON.deserialize<any[]>(res);
    },
    enabled: open && !!sessionId,
  });

  const handlePrint = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setIsReceiptOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('session_transactions')}</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center text-muted-foreground p-8">
              {t('no_transactions')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('time')}</TableHead>
                  <TableHead>{t('invoice')}</TableHead>
                  <TableHead>{t('customer')}</TableHead>
                  <TableHead className="text-right">{t('items')}</TableHead>
                  <TableHead className="text-right">{t('total')}</TableHead>
                  <TableHead className="text-right">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow
                    key={tx.id}
                    className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                    onClick={() => onRowClick?.(tx.id)}
                  >
                    <TableCell>
                      {formatDate(tx.createdAt, "HH:mm:ss")}
                    </TableCell>
                    <TableCell>{tx.invoiceNumber}</TableCell>
                    <TableCell>{tx.contact?.name || t('walk_in_customer')}</TableCell>
                    <TableCell className="text-right">
                      {tx.items?.reduce((acc: number, item: any) => acc + item.quantity, 0) || 0}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(tx.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrint(tx.id);
                        }}
                        title={t('print_receipt')}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog >

      <ReportPreviewDialog
        isOpen={isReceiptOpen}
        onOpenChange={setIsReceiptOpen}
        code="POS_RECEIPT"
        input={{ invoiceId: selectedInvoiceId }}
        title={t('pos_receipt')}
      />
    </>
  );
}
