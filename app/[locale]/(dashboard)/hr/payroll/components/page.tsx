import { getSalaryComponents } from "../actions";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateComponentDialog } from "./_components/create-component-dialog";
import { PageListActions, PageListContent, PageListHeader, PageListLayout, PageListTitle } from "@/components/layout/page/list-layout";

import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { SalaryComponent } from "@/prisma/generated/prisma/client";

type ComponentWithAccount = SalaryComponent & {
    account?: { id: string; code: string; name: string } | null;
};

export default async function SalaryComponentsPage() {
    const response = await getSalaryComponents();
    const components =
        response.success && response.data
            ? SuperJSON.deserialize<ComponentWithAccount[]>(response.data)
            : [];

    return (
        <PageListLayout>
            <PageListHeader>
                <PageListTitle title="Salary Components" />
                <PageListActions>
                    <CreateComponentDialog />
                </PageListActions>
            </PageListHeader>
            <PageListContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Taxable</TableHead>
                            <TableHead>GL Account</TableHead>
                            <TableHead>Description</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {components?.map((component) => (
                            <TableRow key={component.id}>
                                <TableCell className="font-medium">{component.name}</TableCell>
                                <TableCell>
                                    <Badge variant={component.type === "EARNING" ? "default" : "destructive"}>
                                        {component.type}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {component.isTaxable ? <Badge variant="outline">Yes</Badge> : "No"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {component.account
                                        ? `${component.account.code} — ${component.account.name}`
                                        : "—"}
                                </TableCell>
                                <TableCell>{component.description}</TableCell>
                            </TableRow>
                        ))}
                        {!components?.length && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center">
                                    No salary components found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </PageListContent>
        </PageListLayout>
    );
}
