"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { SalaryComponentType } from "@/prisma/generated/prisma/browser";

import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { Contact, CompanyProfile, SalaryStructure, SalaryStructureItem, SalaryComponent, EmployeeDetail } from "@/prisma/generated/prisma/client";

interface SalaryStructureWithDetails extends SalaryStructure {
    items: (SalaryStructureItem & {
        component: SalaryComponent;
    })[];
}

interface SalarySlipProps {
    contact: SuperJSONResult;
    companyProfile: SuperJSONResult | null;
    salaryStructure: SuperJSONResult | null;
}

export function SalarySlip({ contact: serializedContact, companyProfile: serializedProfile, salaryStructure: serializedStructure }: SalarySlipProps) {
    const printRef = useRef<HTMLDivElement>(null);

    const contact = SuperJSON.deserialize<Contact & { employeeDetail: EmployeeDetail | null }>(serializedContact);
    const companyProfile = serializedProfile ? SuperJSON.deserialize<CompanyProfile>(serializedProfile) : null;
    const salaryStructure = serializedStructure ? SuperJSON.deserialize<SalaryStructureWithDetails>(serializedStructure) : null;

    const baseSalary = Number(salaryStructure?.baseSalary ?? 0);
    const items = salaryStructure?.items ?? [];

    const earnings = items.filter((i) => i.component?.type === SalaryComponentType.EARNING);
    const deductions = items.filter((i) => i.component?.type === SalaryComponentType.DEDUCTION);

    const totalEarnings = baseSalary + earnings.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalDeductions = deductions.reduce((sum, i) => sum + Number(i.amount), 0);
    const netSalary = totalEarnings - totalDeductions;

    const currentDate = format(new Date(), "MMMM yyyy");
    const printDate = format(new Date(), "dd MMM yyyy");

    const currencySymbol = companyProfile?.currencySymbol || "Rp";

    const formatCurrency = (amount: number) => {
        return `${currencySymbol} ${amount.toLocaleString()}`;
    };

    const handlePrint = () => {
        window.print();
    };

    // Pad arrays to equal length for side-by-side table
    const maxRows = Math.max(earnings.length + 1, deductions.length);

    return (
        <>
            {/* Print-only styles */}
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

            {/* Screen-only toolbar */}
            <div className="no-print flex items-center gap-4 mb-6 px-4">
                <Link href={`/hr/payroll/salary-structures/${contact.id}`}>
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

            {/* Printable Salary Slip */}
            <div ref={printRef} className="salary-slip-print max-w-3xl mx-auto bg-white dark:bg-white text-black p-8 rounded-lg border shadow-sm print:shadow-none print:border-0">
                {/* Header */}
                <div className="text-center border-b-2 border-black pb-4 mb-6">
                    <h1 className="text-xl font-bold uppercase tracking-wide">
                        {companyProfile?.name || "Company Name"}
                    </h1>
                    {companyProfile?.address && (
                        <p className="text-sm text-gray-600 mt-1">{companyProfile.address}</p>
                    )}
                    {(companyProfile?.phone || companyProfile?.email) && (
                        <p className="text-sm text-gray-600">
                            {[companyProfile.phone, companyProfile.email].filter(Boolean).join(" | ")}
                        </p>
                    )}
                    <h2 className="text-base font-semibold mt-3 uppercase tracking-wider">
                        Salary Slip — {currentDate}
                    </h2>
                </div>

                {/* Employee Info */}
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
                        <span>: {contact.id.slice(-6).toUpperCase()}</span>
                    </div>
                    <div className="flex">
                        <span className="font-semibold w-32">Department</span>
                        <span>: {contact.employeeDetail?.department || "-"}</span>
                    </div>
                    {contact.employeeDetail?.joinDate && (
                        <div className="flex">
                            <span className="font-semibold w-32">Join Date</span>
                            <span>: {format(new Date(contact.employeeDetail.joinDate), "dd MMM yyyy")}</span>
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

                {/* Salary Table — side by side earnings/deductions */}
                <table className="w-full border-collapse text-sm mb-6">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-3 py-2 text-left font-semibold" colSpan={2}>
                                Earnings
                            </th>
                            <th className="border border-gray-300 px-3 py-2 text-left font-semibold" colSpan={2}>
                                Deductions
                            </th>
                        </tr>
                        <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-3 py-1.5 text-left text-xs font-medium">Component</th>
                            <th className="border border-gray-300 px-3 py-1.5 text-right text-xs font-medium w-[120px]">Amount</th>
                            <th className="border border-gray-300 px-3 py-1.5 text-left text-xs font-medium">Component</th>
                            <th className="border border-gray-300 px-3 py-1.5 text-right text-xs font-medium w-[120px]">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: maxRows }).map((_, idx) => {
                            // First earnings row = Base Salary, rest = earnings items offset by 1
                            const earningItem = idx === 0
                                ? { label: "Base Salary", amount: baseSalary }
                                : earnings[idx - 1]
                                    ? { label: earnings[idx - 1].component?.name, amount: Number(earnings[idx - 1].amount) }
                                    : null;

                            const deductionItem = deductions[idx]
                                ? { label: deductions[idx].component?.name, amount: Number(deductions[idx].amount) }
                                : null;

                            return (
                                <tr key={idx}>
                                    <td className="border border-gray-300 px-3 py-1.5">
                                        {earningItem?.label || ""}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1.5 text-right">
                                        {earningItem ? formatCurrency(earningItem.amount) : ""}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1.5">
                                        {deductionItem?.label || ""}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1.5 text-right">
                                        {deductionItem ? formatCurrency(deductionItem.amount) : ""}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="bg-gray-100 font-semibold">
                            <td className="border border-gray-300 px-3 py-2">Total Earnings</td>
                            <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(totalEarnings)}</td>
                            <td className="border border-gray-300 px-3 py-2">Total Deductions</td>
                            <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(totalDeductions)}</td>
                        </tr>
                    </tfoot>
                </table>

                {/* Net Salary */}
                <div className="border-2 border-black p-4 text-center mb-8">
                    <span className="text-sm font-semibold uppercase tracking-wider">Net Salary: </span>
                    <span className="text-lg font-bold ml-2">{formatCurrency(netSalary)}</span>
                </div>

                {/* Signature Section */}
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

                {/* Footer note */}
                <p className="text-xs text-gray-500 text-center mt-8 italic">
                    This is a system-generated salary slip. If you have any questions, please contact HR.
                </p>
            </div>
        </>
    );
}
