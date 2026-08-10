import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SiteHeader } from "@/components/layout/header/site-header";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import { verifySession } from "@/services/lib/auth/auth";
import { prisma } from "@/services/lib/prisma";
import { SessionProvider } from "@/components/providers/session-provider";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifySession();

  if (session.role === "Cashier") {
    redirect("/pos");
  }

  let userData = {
    name: "User",
    email: "",
    avatar: "",
    role: "",
  };

  if (session?.userId) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (user) {
      userData = {
        ...userData,
        name: user.name,
        email: user.email,
        role: session.role || user.role?.name || "Member",
      };
    }
  }

  const companyProfile = await prisma.companyProfile.findFirst();

  return (
    <SessionProvider
      session={{
        userName: session.userName,
        role: session.role,
        permissions: session.permissions,
        companyProfile: companyProfile
          ? {
              name: companyProfile.name,
              address: companyProfile.address,
              phone: companyProfile.phone,
              email: companyProfile.email,
              website: companyProfile.website,
              taxId: companyProfile.taxId,
              currency: companyProfile.currency,
              currencySymbol: companyProfile.currencySymbol,
              dateFormat: companyProfile.dateFormat,
              currencyFormat: companyProfile.currencyFormat,
              locale: companyProfile.locale,
              timezone: companyProfile.timezone,
            }
          : null,
      }}
    >
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar
          user={userData}
          companyName={companyProfile?.name || "Company Name"}
        />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <div className="flex flex-col gap-4 py-2 md:gap-6 md:py-2">
                {children}
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </SessionProvider>
  );
}
