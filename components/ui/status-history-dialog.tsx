"use client";

import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/services/lib/utils";

export type StatusHistoryEvent = {
  event: string;
  at?: Date | string | null;
  byName?: string | null;
};

type StatusHistoryDialogProps = {
  events: StatusHistoryEvent[];
};

export function StatusHistoryDialog({ events }: StatusHistoryDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <InfoIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="min-w-1/3">
        <DialogHeader>
          <DialogTitle>Status History</DialogTitle>
        </DialogHeader>
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="font-medium">Event</TableHead>
              <TableHead className="text-right">Timestamp</TableHead>
              <TableHead className="text-right">User</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((item) => (
              <TableRow key={item.event}>
                <TableCell>{item.event}</TableCell>
                <TableCell className="text-right">
                  {item.at ? formatDate(item.at, { includeTime: true }) : ""}
                </TableCell>
                <TableCell className="text-right">
                  {item.byName || "System"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
