import { verifySession } from "@/services/lib/auth/auth";
import { prisma } from "@/services/lib/prisma";
import { SessionProvider } from "@/components/providers/session-provider";
import { POSClickSound } from "./_components/pos-click-sound";

export default async function POSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifySession();

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
      <POSClickSound />
      <div className="min-h-screen bg-background">
        {children}
      </div>
    </SessionProvider>
  );
}
