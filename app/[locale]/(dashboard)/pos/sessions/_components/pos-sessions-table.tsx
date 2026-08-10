"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { SuperJSONResult } from "superjson";
import { SuperJSON } from "@/services/lib/superjson";
import { useTranslations } from "next-intl";
import { useFormatCurrency } from "@/hooks/use-format-currency";

interface POSSessionsTableProps {
  sessions: SuperJSONResult;
}

export function POSSessionsTable({
  sessions: serializedSessions,
}: POSSessionsTableProps) {
  const t = useTranslations("POS");
  const sessions = SuperJSON.deserialize<any[]>(serializedSessions);
  const formatCurrency = useFormatCurrency();

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("session_id")}</TableHead>
            <TableHead>{t("cashier")}</TableHead>
            <TableHead>{t("location")}</TableHead>
            <TableHead>{t("department")}</TableHead>
            <TableHead>{t("start_time")}</TableHead>
            <TableHead>{t("end_time")}</TableHead>
            <TableHead className="text-right">{t("opening_cash")}</TableHead>
            <TableHead className="text-right">{t("closing_cash")}</TableHead>
            <TableHead className="text-right">{t("difference")}</TableHead>
            <TableHead className="text-center">{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="h-24 text-center">
                {t("no_sessions_found")}
              </TableCell>
            </TableRow>
          ) : (
            sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="font-medium">
                  {session.sessionNumber}
                </TableCell>
                <TableCell>{session.cashier?.name}</TableCell>
                <TableCell>{session.warehouse?.name || "-"}</TableCell>
                <TableCell>{session.department?.name || "-"}</TableCell>
                <TableCell>
                  {format(new Date(session.startTime), "PP p")}
                </TableCell>
                <TableCell>
                  {session.endTime
                    ? format(new Date(session.endTime), "PP p")
                    : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(session.openingCash)}
                </TableCell>
                <TableCell className="text-right">
                  {session.closingCash
                    ? formatCurrency(session.closingCash)
                    : "-"}
                </TableCell>
                <TableCell
                  className={`text-right ${session.difference?.isNegative() ? "text-red-500" : "text-green-500"}`}
                >
                  {session.difference
                    ? formatCurrency(session.difference)
                    : "-"}
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={
                      session.status === "OPEN" ? "default" : "secondary"
                    }
                  >
                    {session.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
