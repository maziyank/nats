"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Wallet,
  ArrowRight,
  CalendarCheck,
  CalendarOff,
  BarChart3,
  Layers,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { getHrDashboardStats } from "../employees/actions";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { usePermission } from "@/services/lib/permissions/use-permission";

type DashboardStats = {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  pendingLeaves: number;
  openPeriods: number;
  byDepartment: { department: string; count: number }[];
};

export default function HrLandingPage() {
  const t = useTranslations("HR");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const canViewEmployees = usePermission("hr.employees.view");
  const canViewPayroll = usePermission("payroll.view");
  const canViewAttendance = usePermission("hr.attendance.view");
  const canViewLeave = usePermission("hr.leave.view");

  useEffect(() => {
    async function load() {
      try {
        const result = await getHrDashboardStats();
        if (result.success && result.data) {
          setStats(
            SuperJSON.deserialize<DashboardStats>(
              result.data as SuperJSONResult
            )
          );
        }
      } catch {
        // Stats are optional on landing
      }
    }
    if (canViewEmployees) {
      load();
    }
  }, [canViewEmployees]);

  const hrModules = [
    {
      title: t("employees"),
      description: t("employees_desc"),
      icon: Users,
      href: "/hr/employees",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      step: 1,
      visible: canViewEmployees,
    },
    {
      title: t("salary_structures"),
      description: t("salary_structures_desc"),
      icon: Layers,
      href: "/hr/payroll/salary-structures",
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      step: 2,
      visible: canViewPayroll,
    },
    {
      title: t("payroll"),
      description: t("payroll_desc"),
      icon: Wallet,
      href: "/hr/payroll",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      step: 3,
      visible: canViewPayroll,
    },
    {
      title: t("attendance"),
      description: t("attendance_desc"),
      icon: CalendarCheck,
      href: "/hr/attendance",
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      step: 4,
      visible: canViewAttendance,
    },
    {
      title: t("leaves"),
      description: t("leaves_desc"),
      icon: CalendarOff,
      href: "/hr/leaves",
      color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
      step: 5,
      visible: canViewLeave,
    },
    {
      title: t("reports"),
      description: t("reports_desc"),
      icon: BarChart3,
      href: "/hr/reports",
      color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
      step: 6,
      visible: canViewEmployees || canViewPayroll,
    },
  ].filter((m) => m.visible);

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard")}</h1>
          <p className="text-muted-foreground">{t("dashboard_subtitle")}</p>
        </div>
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("headcount")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeEmployees}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalEmployees} {t("employees").toLowerCase()} · {stats.inactiveEmployees}{" "}
                {t("inactive").toLowerCase()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("pending_leaves")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingLeaves}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("payroll")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.openPeriods}</div>
              <p className="text-xs text-muted-foreground">{t("open_periods")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("departments")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byDepartment.length}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("process_flow")}</CardTitle>
          <CardDescription>{t("process_flow_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {hrModules.map((mod, i) => (
              <div key={mod.href} className="flex items-center gap-2">
                <Link
                  href={mod.href}
                  className="rounded-full bg-muted px-3 py-1.5 font-medium hover:bg-muted/80 transition-colors"
                >
                  {mod.step}. {mod.title}
                </Link>
                {i < hrModules.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {hrModules.map((mod) => (
          <Link key={mod.href} href={mod.href} className="group">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className={`rounded-lg p-2 ${mod.color}`}>
                    <mod.icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("step")} {mod.step}
                  </span>
                </div>
                <CardTitle className="mt-2 group-hover:underline">
                  {mod.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {mod.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
