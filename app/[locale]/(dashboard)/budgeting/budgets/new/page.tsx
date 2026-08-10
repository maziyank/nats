
export const dynamic = "force-dynamic";

import { getDepartments, getProjects } from "@/app/[locale]/(dashboard)/general/actions";
import { getAccounts } from "@/app/[locale]/(dashboard)/budgeting/actions";
import { BudgetForm } from "@/app/[locale]/(dashboard)/budgeting/_components/budget-form";
import { SuperJSON } from "@/services/lib/superjson";

export default async function NewBudgetPage() {
  const [departments, projects, accountsResult] = await Promise.all([
    getDepartments(),
    getProjects(),
    getAccounts(),
  ]);

  const accounts =
    accountsResult.success && accountsResult.data
      ? SuperJSON.deserialize<any[]>(accountsResult.data)
      : [];


  return (
    <BudgetForm
      departments={SuperJSON.serialize(departments)}
      projects={SuperJSON.serialize(projects)}
      accounts={SuperJSON.serialize(accounts)}
    />
  );
}
