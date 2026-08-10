export const dynamic = "force-dynamic";

import { prisma } from "@/services/lib/prisma";
import { TransactionForm } from "../_components/transaction-form";
import { getDepartments, getProjects } from "@/app/[locale]/(dashboard)/general/actions";

export default async function NewTransactionPage() {
  const [cashAccounts, glAccounts, contacts, departments, projects] = await Promise.all([
    prisma.cashAccount.findMany({
      where: { isActive: true },
    }),
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.contact.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    getDepartments(),
    getProjects(),
  ]);

  return (
    <TransactionForm
      cashAccounts={cashAccounts}
      glAccounts={glAccounts}
      contacts={contacts}
      departments={departments}
      projects={projects.projects}
    />
  );
}
