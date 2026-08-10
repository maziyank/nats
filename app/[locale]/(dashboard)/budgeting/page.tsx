export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { getBudgets } from "./actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/services/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getSession } from "@/services/lib/auth/auth";
import { SuperJSON } from "@/services/lib/superjson";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PageListLayout,
  PageListHeader,
  PageListTitle,
  PageListActions,
  PageListContent,
} from "@/components/layout/page/list-layout";

export default async function BudgetingPage() {
  const session = await getSession();
  const response = await getBudgets();
  const budgets =
    response.success && response.data
      ? SuperJSON.deserialize<any[]>(response.data)
      : [];


  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title="Budgeting" />
        <PageListActions>
          <div className="flex items-center space-x-2">
            <Link href="/budgeting/configuration">
              <Button variant="outline">Configuration</Button>
            </Link>
            <Link href="/budgeting/budgets/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Create Budget
              </Button>
            </Link>
          </div>
        </PageListActions>
      </PageListHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Active Budgets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {budgets.filter((b) => b.status === "APPROVED").length}
            </div>
          </CardContent>
        </Card>
        {/* Add more summary cards here later */}
      </div>

      <PageListContent>
        <div className="p-6">
          <div className="mb-4">
            <h3 className="text-lg font-medium">Recent Budgets</h3>
          </div>
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
                    No budgets found. Create one to get started.
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
                      <Badge
                        variant={
                          budget.status === "APPROVED"
                            ? "default"
                            : budget.status === "REJECTED"
                              ? "destructive"
                              : budget.status === "PENDING_APPROVAL"
                                ? "secondary"
                                : "outline"
                        }
                      >
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
        </div>
      </PageListContent>
    </PageListLayout>
  );
}
