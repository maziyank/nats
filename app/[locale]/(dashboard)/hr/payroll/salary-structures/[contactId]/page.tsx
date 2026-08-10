export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getSalaryStructure } from "../../actions";
import { prisma } from "@/services/lib/prisma";
import {
    PageFormLayout,
    PageFormHeader,
    PageFormTitle,
} from "@/components/layout/page/form-layout";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { SalaryStructureEditor } from "./_components/salary-structure-editor";
import { SalaryStructureHistory } from "./_components/salary-structure-history";
import { ContactType } from "@/prisma/generated/prisma/client";

import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";

interface PageProps {
    params: Promise<{ contactId: string }>;
}

export default async function SalaryStructureDetailPage({ params }: PageProps) {
    const { contactId } = await params;

    const contact = await prisma.contact.findUnique({
        where: { id: contactId, type: ContactType.EMPLOYEE },
    });

    if (!contact) {
        notFound();
    }

    const response = await getSalaryStructure(contactId);
    const salaryStructure =
        response.success && response.data ? response.data : null;

    return (
        <PageFormLayout>
            <PageFormHeader>
                <PageFormTitle>
                    <div className="flex items-center gap-4">
                        <span>{contact.name}</span>
                        <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 border-transparent">
                            Employee
                        </Badge>
                        <div className="ml-auto">
                            <Link href={`/hr/payroll/salary-structures/${contactId}/print`}>
                                <Button variant="outline" size="sm">
                                    <Printer className="mr-2 h-4 w-4" />
                                    Print Salary Slip
                                </Button>
                            </Link>
                        </div>
                    </div>
                </PageFormTitle>
            </PageFormHeader>

            <SalaryStructureEditor contactId={contactId} initialStructure={salaryStructure} />

            <SalaryStructureHistory contactId={contactId} />
        </PageFormLayout>
    );
}
