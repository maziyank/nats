"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomPagination } from "@/components/ui/custom-pagination";
import { Loader2 } from "lucide-react";
import { cn } from "@/services/lib/utils";

export interface Column<T> {
  header: React.ReactNode;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyMessage?: React.ReactNode;
  onRowClick?: (item: T) => void;
  pagination?: {
    totalEntries: number;
    pageSize?: number;
    currentPage?: number;
    onPageChange?: (page: number) => void;
  };
  rowKey?: keyof T | ((item: T) => string | number);
  className?: string;
  footer?: React.ReactNode;
}

export function DataTable<T>({
  data,
  columns,
  isLoading,
  emptyMessage = "No data found.",
  onRowClick,
  pagination,
  rowKey = "id" as keyof T,
  className,
  footer,
}: DataTableProps<T>) {
  const getRowKey = (item: T, index: number) => {
    if (typeof rowKey === "function") {
      return rowKey(item);
    }
    return (item[rowKey] as unknown as string | number) || index;
  };

  return (
    <div className={cn(className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col, index) => (
              <TableHead key={index} className={col.headerClassName}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                <div className="flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((item, rowIndex) => (
              <TableRow
                key={getRowKey(item, rowIndex)}
                className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col, colIndex) => (
                  <TableCell key={colIndex} className={col.className}>
                    {col.cell
                      ? col.cell(item)
                      : col.accessorKey
                        ? (item[col.accessorKey] as React.ReactNode)
                        : null}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        {footer}
      </Table>

      {pagination && (
        <CustomPagination
          totalEntries={pagination.totalEntries}
          pageSize={pagination.pageSize}
          currentPage={pagination.currentPage}
          onPageChange={pagination.onPageChange}
        />
      )}
    </div>
  );
}
