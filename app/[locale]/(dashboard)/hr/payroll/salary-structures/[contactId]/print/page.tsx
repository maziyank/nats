export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/services/lib/prisma";
import { ContactType } from "@/prisma/generated/prisma/client";
import { getSalaryStructure } from "../../../actions";
import { SalarySlip } from "./_components/salary-slip";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";

interface PageProps {
    params: Promise<{ contactId: string }>;
}

export default async function PrintSalarySlipPage({ params }: PageProps) {
    const { contactId } = await params;

    const [contact, companyProfile] = await Promise.all([
        prisma.contact.findUnique({
            where: { id: contactId, type: ContactType.EMPLOYEE },
            include: { employeeDetail: true },
        }),
        prisma.companyProfile.findFirst(),
    ]);

    if (!contact) {
        notFound();
    }

    const response = await getSalaryStructure(contactId);
    const salaryStructure =
        response.success && response.data ? response.data : null;

    return (
        <SalarySlip
            contact={SuperJSON.serialize(contact)}
            companyProfile={companyProfile ? SuperJSON.serialize(companyProfile) : null}
            salaryStructure={salaryStructure}
        />
    );
}
