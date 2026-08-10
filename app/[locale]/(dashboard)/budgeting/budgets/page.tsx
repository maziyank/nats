export const dynamic = "force-dynamic";

import { getBudgets } from "@/app/[locale]/(dashboard)/budgeting/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SuperJSON } from "@/services/lib/superjson";

export default async function BudgetsListPage() {
  const response = await getBudgets();
  const budgets =
    response.success && response.data
      ? SuperJSON.deserialize<any[]>(response.data)
      : [];


  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">All Budgets</h2>
        <Link href="/budgeting/budgets/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Create Budget
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Budgets</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Fiscal Year</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    No budgets found.
                  </TableCell>
                </TableRow>
              ) : (
                budgets.map((budget) => (
                  <TableRow key={budget.id}>
                    <TableCell className="font-medium">{budget.name}</TableCell>
                    <TableCell>{budget.fiscalYear}</TableCell>
                    <TableCell>{budget.department?.name || "-"}</TableCell>
                    <TableCell>{budget.project?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={
                        budget.status === "APPROVED" ? "default" :
                          budget.status === "REJECTED" ? "destructive" :
                            budget.status === "PENDING_APPROVAL" ? "secondary" : "outline"
                      }>
                        {budget.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{budget.createdByUser.name}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/budgeting/budgets/${budget.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
