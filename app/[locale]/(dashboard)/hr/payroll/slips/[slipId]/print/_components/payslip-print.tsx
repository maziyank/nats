"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { SalaryComponentType } from "@/prisma/generated/prisma/browser";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import {
    Contact,
    CompanyProfile,
    SalarySlip,
    SalarySlipItem,
    SalaryComponent,
    EmployeeDetail,
    PayrollPeriod,
} from "@/prisma/generated/prisma/client";

type SlipWithDetails = SalarySlip & {
    period: PayrollPeriod;
    contact: Contact & { employeeDetail: EmployeeDetail | null };
    items: (SalarySlipItem & { component: SalaryComponent })[];
};

interface PayslipPrintProps {
    slip: SuperJSONResult;
    companyProfile: SuperJSONResult | null;
}

export function PayslipPrint({
    slip: serializedSlip,
    companyProfile: serializedProfile,
}: PayslipPrintProps) {
    const printRef = useRef<HTMLDivElement>(null);

    const slip = SuperJSON.deserialize<SlipWithDetails>(serializedSlip);
    const companyProfile = serializedProfile
        ? SuperJSON.deserialize<CompanyProfile>(serializedProfile)
        : null;

    const contact = slip.contact;
    const items = slip.items ?? [];
    const earnings = items.filter((i) => i.type === SalaryComponentType.EARNING);
    const deductions = items.filter((i) => i.type === SalaryComponentType.DEDUCTION);

    const totalEarnings = Number(slip.grossSalary);
    const totalDeductions = Number(slip.totalDeductions);
    const netSalary = Number(slip.netSalary);

    const periodLabel = slip.period?.name
        || (slip.period
            ? `${format(new Date(slip.period.startDate), "dd MMM yyyy")} – ${format(new Date(slip.period.endDate), "dd MMM yyyy")}`
            : format(new Date(), "MMMM yyyy"));

    const printDate = format(new Date(), "dd MMM yyyy");
    const currencySymbol = companyProfile?.currencySymbol || "Rp";

    const formatCurrency = (amount: number) =>
        `${currencySymbol} ${amount.toLocaleString()}`;

    const handlePrint = () => {
        window.print();
    };

    const maxRows = Math.max(earnings.length, deductions.length, 1);

    return (
        <>
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .salary-slip-print,
                    .salary-slip-print * {
                        visibility: visible;
                    }
                    .salary-slip-print {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        padding: 20mm;
                    }
                    .no-print {
                        display: none !important;
                    }
                    @page {
                        size: A4;
                        margin: 10mm;
                    }
                }
            `}</style>

            <div className="no-print flex items-center gap-4 mb-6 px-4">
                <Link href={`/hr/payroll/${slip.periodId}`}>
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h1 className="text-lg font-semibold flex-1">Salary Slip Preview</h1>
                <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                </Button>
            </div>

            <div
                ref={printRef}
                className="salary-slip-print max-w-3xl mx-auto bg-white dark:bg-white text-black p-8 rounded-lg border shadow-sm print:shadow-none print:border-0"
            >
                <div className="text-center border-b-2 border-black pb-4 mb-6">
                    <h1 className="text-xl font-bold uppercase tracking-wide">
                        {companyProfile?.name || "Company Name"}
                    </h1>
                    {companyProfile?.address && (
                        <p className="text-sm text-gray-600 mt-1">{companyProfile.address}</p>
                    )}
                    {(companyProfile?.phone || companyProfile?.email) && (
                        <p className="text-sm text-gray-600">
                            {[companyProfile.phone, companyProfile.email]
                                .filter(Boolean)
                                .join(" | ")}
                        </p>
                    )}
                    <h2 className="text-base font-semibold mt-3 uppercase tracking-wider">
                        Salary Slip — {periodLabel}
                    </h2>
                    {slip.period && (
                        <p className="text-xs text-gray-600 mt-1">
                            {format(new Date(slip.period.startDate), "dd MMM yyyy")} –{" "}
                            {format(new Date(slip.period.endDate), "dd MMM yyyy")}
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-6 text-sm">
                    <div className="flex">
                        <span className="font-semibold w-32">Employee Name</span>
                        <span>: {contact.name}</span>
                    </div>
                    <div className="flex">
                        <span className="font-semibold w-32">Job Title</span>
                        <span>: {contact.employeeDetail?.jobTitle || "-"}</span>
                    </div>
                    <div className="flex">
                        <span className="font-semibold w-32">Employee ID</span>
                        <span>
                            :{" "}
                            {contact.employeeDetail?.employeeNumber ||
                                contact.id.slice(-6).toUpperCase()}
                        </span>
                    </div>
                    <div className="flex">
                        <span className="font-semibold w-32">Department</span>
                        <span>: {contact.employeeDetail?.department || "-"}</span>
                    </div>
                    {contact.employeeDetail?.joinDate && (
                        <div className="flex">
                            <span className="font-semibold w-32">Join Date</span>
                            <span>
                                :{" "}
                                {format(
                                    new Date(contact.employeeDetail.joinDate),
                                    "dd MMM yyyy"
                                )}
                            </span>
                        </div>
                    )}
                    <div className="flex">
                        <span className="font-semibold w-32">Date</span>
                        <span>: {printDate}</span>
                    </div>
                    {contact.employeeDetail?.taxId && (
                        <div className="flex">
                            <span className="font-semibold w-32">Tax ID (NPWP)</span>
                            <span>: {contact.employeeDetail.taxId}</span>
                        </div>
                    )}
                    <div className="flex">
                        <span className="font-semibold w-32">Bank Name</span>
                        <span>: {contact.employeeDetail?.bankName || "-"}</span>
                    </div>
                    <div className="flex">
                        <span className="font-semibold w-32">Bank Account</span>
                        <span>: {contact.employeeDetail?.bankAccount || "-"}</span>
                    </div>
                </div>

                <table className="w-full border-collapse text-sm mb-6">
                    <thead>
                        <tr className="bg-gray-100">
                            <th
                                className="border border-gray-300 px-3 py-2 text-left font-semibold"
                                colSpan={2}
                            >
                                Earnings
                            </th>
                            <th
                                className="border border-gray-300 px-3 py-2 text-left font-semibold"
                                colSpan={2}
                            >
                                Deductions
                            </th>
                        </tr>
                        <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-3 py-1.5 text-left text-xs font-medium">
                                Component
                            </th>
                            <th className="border border-gray-300 px-3 py-1.5 text-right text-xs font-medium w-[120px]">
                                Amount
                            </th>
                            <th className="border border-gray-300 px-3 py-1.5 text-left text-xs font-medium">
                                Component
                            </th>
                            <th className="border border-gray-300 px-3 py-1.5 text-right text-xs font-medium w-[120px]">
                                Amount
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: maxRows }).map((_, idx) => {
                            const earningItem = earnings[idx]
                                ? {
                                      label: earnings[idx].component?.name || "Earning",
                                      amount: Number(earnings[idx].amount),
                                  }
                                : null;
                            const deductionItem = deductions[idx]
                                ? {
                                      label: deductions[idx].component?.name || "Deduction",
                                      amount: Number(deductions[idx].amount),
                                  }
                                : null;

                            return (
                                <tr key={idx}>
                                    <td className="border border-gray-300 px-3 py-1.5">
                                        {earningItem?.label || ""}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1.5 text-right">
                                        {earningItem
                                            ? formatCurrency(earningItem.amount)
                                            : ""}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1.5">
                                        {deductionItem?.label || ""}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1.5 text-right">
                                        {deductionItem
                                            ? formatCurrency(deductionItem.amount)
                                            : ""}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="bg-gray-100 font-semibold">
                            <td className="border border-gray-300 px-3 py-2">
                                Total Earnings
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-right">
                                {formatCurrency(totalEarnings)}
                            </td>
                            <td className="border border-gray-300 px-3 py-2">
                                Total Deductions
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-right">
                                {formatCurrency(totalDeductions)}
                            </td>
                        </tr>
                    </tfoot>
                </table>

                <div className="border-2 border-black p-4 text-center mb-8">
                    <span className="text-sm font-semibold uppercase tracking-wider">
                        Net Salary:{" "}
                    </span>
                    <span className="text-lg font-bold ml-2">
                        {formatCurrency(netSalary)}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-8 mt-16 text-sm">
                    <div className="text-center">
                        <div className="border-t border-gray-400 pt-2 mx-8">
                            <p className="font-medium">Employee Signature</p>
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="border-t border-gray-400 pt-2 mx-8">
                            <p className="font-medium">Authorized Signature</p>
                        </div>
                    </div>
                </div>

                <p className="text-xs text-gray-500 text-center mt-8 italic">
                    This is a system-generated salary slip. If you have any questions,
                    please contact HR.
                </p>
            </div>
        </>
    );
}
