import { Users } from "lucide-react";
import type { ModulePlugin } from "./types";

export const hrPlugin: ModulePlugin = {
    id: "hr",
    navigation: [
        {
            section: "Operations",
            items: [
                {
                    title: "Navigation.hr",
                    url: "#",
                    icon: Users,
                    items: [
                        { title: "HR.overview", url: "/hr" },
                        { title: "HR.employees", url: "/hr/employees" },
                        { title: "HR.payroll", url: "/hr/payroll" },
                        { title: "HR.salary_structures", url: "/hr/payroll/salary-structures" },
                        { title: "HR.salary_components", url: "/hr/payroll/components" },
                        { title: "HR.attendance", url: "/hr/attendance" },
                        { title: "HR.leaves", url: "/hr/leaves" },
                        { title: "HR.reports", url: "/hr/reports" },
                    ],
                },
            ],
        },
    ],
    permissions: [
        {
            name: "hr.employees.view",
            description: "Allows viewing employee records",
            module: "hr",
        },
        {
            name: "hr.employees.create",
            description: "Allows creating employees",
            module: "hr",
        },
        {
            name: "hr.employees.edit",
            description: "Allows editing employees",
            module: "hr",
        },
        {
            name: "hr.attendance.view",
            description: "Allows viewing attendance records",
            module: "hr",
        },
        {
            name: "hr.attendance.manage",
            description: "Allows managing attendance records",
            module: "hr",
        },
        {
            name: "hr.leave.view",
            description: "Allows viewing leave requests",
            module: "hr",
        },
        {
            name: "hr.leave.manage",
            description: "Allows creating and reviewing leave requests",
            module: "hr",
        },
        {
            name: "payroll.view",
            description: "Allows viewing payroll data",
            module: "hr",
        },
        {
            name: "payroll.create",
            description: "Allows creating payroll periods and running payroll",
            module: "hr",
        },
        {
            name: "payroll.approve",
            description: "Allows approving payroll runs",
            module: "hr",
        },
        {
            name: "payroll.configure",
            description: "Allows configuring salary structures and components",
            module: "hr",
        },
        {
            name: "payroll.pay",
            description: "Allows marking salary slips as paid and exporting bank files",
            module: "hr",
        },
    ],
};
