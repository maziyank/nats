
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/services/lib/utils";

interface BudgetItemsTableProps {
  items: {
    accountId: string;
    accountName: string;
    accountCode: string;
    budgeted: number;
    actual: number;
    variance: number;
    percentage: number;
  }[];
}

export function BudgetItemsTable({ items }: BudgetItemsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Budgeted</TableHead>
          <TableHead className="text-right">Actual</TableHead>
          <TableHead className="text-right">Variance</TableHead>
          <TableHead className="text-right">% Used</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.accountId}>
            <TableCell>
              <div className="font-medium">{item.accountName}</div>
              <div className="text-xs text-muted-foreground">{item.accountCode}</div>
            </TableCell>
            <TableCell className="text-right">{formatCurrency(item.budgeted)}</TableCell>
            <TableCell className="text-right">{formatCurrency(item.actual)}</TableCell>
            <TableCell className="text-right">
              <span className={item.variance < 0 ? "text-destructive" : "text-green-600"}>
                {formatCurrency(item.variance)}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <Badge variant={item.percentage > 100 ? "destructive" : item.percentage > 80 ? "secondary" : "outline"}>
                {item.percentage.toFixed(1)}%
              </Badge>
            </TableCell>
          </TableRow>
        ))}
        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">No items found</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// Removed inline formatCurrency function as we import it from lib/utils
