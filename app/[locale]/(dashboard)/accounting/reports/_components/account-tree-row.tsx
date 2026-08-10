import { ReportAccountLine } from "../actions";
import { cn } from "@/services/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { TableRow, TableCell } from "@/components/ui/table";

interface AccountTreeRowProps {
  node: ReportAccountLine;
  level?: number;
  showComparative?: boolean;
}

import { useTranslations } from "next-intl";

export function AccountTreeRow({
  node,
  level = 0,
  showComparative = false,
}: AccountTreeRowProps) {
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();
  const hasChildren = node.children && node.children.length > 0;
  const paddingLeft = level * 20 + (hasChildren ? 0 : 20);

  const formatPercentage = (val?: number) => {
    if (val === undefined || isNaN(val)) return "-";
    return `${val.toFixed(1)}%`;
  };

  return (
    <>
      <TableRow
        className={cn("hover:bg-muted/50", level === 0 && "font-semibold")}
      >
        <TableCell
          style={{ paddingLeft: `${paddingLeft}px` }}
          className="truncate"
        >
          {node.code} - {node.name}
        </TableCell>
        <TableCell className="text-right">
          {hasChildren ? "" : formatCurrency(node.amount)}
        </TableCell>
        {showComparative && (
          <>
            <TableCell className="text-right text-muted-foreground">
              {hasChildren ? "" : formatCurrency(node.previousAmount || 0)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {hasChildren ? "" : formatCurrency(node.change || 0)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right",
                (node.changePercentage || 0) < 0
                  ? "text-red-500"
                  : "text-green-500"
              )}
            >
              {hasChildren ? "" : formatPercentage(node.changePercentage)}
            </TableCell>
          </>
        )}
      </TableRow>
      {hasChildren && (
        <>
          {node.children!.map((child) => (
            <AccountTreeRow
              key={child.accountId}
              node={child}
              level={level + 1}
              showComparative={showComparative}
            />
          ))}
          <TableRow className="font-medium bg-muted/20">
            <TableCell
              style={{ paddingLeft: `${paddingLeft}px` }}
              className="truncate"
            >
              {tCommon("total")} {node.name}
            </TableCell>
            <TableCell className="text-right border-t border-black/20">
              {formatCurrency(node.amount)}
            </TableCell>
            {showComparative && (
              <>
                <TableCell className="text-right border-t border-black/20 text-muted-foreground">
                  {formatCurrency(node.previousAmount || 0)}
                </TableCell>
                <TableCell className="text-right border-t border-black/20 text-muted-foreground">
                  {formatCurrency(node.change || 0)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right border-t border-black/20",
                    (node.changePercentage || 0) < 0
                      ? "text-red-500"
                      : "text-green-500"
                  )}
                >
                  {formatPercentage(node.changePercentage)}
                </TableCell>
              </>
            )}
          </TableRow>
        </>
      )}
    </>
  );
}
