export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/services/lib/prisma";
import { getSalarySlip } from "../../../actions";
import { PayslipPrint } from "./_components/payslip-print";
import { SuperJSON } from "@/services/lib/superjson";

interface PageProps {
    params: Promise<{ slipId: string }>;
}

export default async function PrintPayslipPage({ params }: PageProps) {
    const { slipId } = await params;

    const [response, companyProfile] = await Promise.all([
        getSalarySlip(slipId),
        prisma.companyProfile.findFirst(),
    ]);

    if (!response.success) {
        notFound();
    }
    if (!response.data) {
        notFound();
    }

    return (
        <PayslipPrint
            slip={response.data}
            companyProfile={companyProfile ? SuperJSON.serialize(companyProfile) : null}
        />
    );
}
