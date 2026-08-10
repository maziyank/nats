"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { JournalEntryForm } from "../_components/journal-entry-form";
import { createJournalEntry } from "../actions";
import { getAccounts } from "../../accounts/actions";
import { getContacts } from "@/app/[locale]/(dashboard)/general/contacts/actions";
import { getDepartments, getProjects } from "@/app/[locale]/(dashboard)/general/actions";
import { EntryStatus } from "@/prisma/generated/prisma/browser";
import { CreateJournalEntryData } from "../../types";
import { generateId } from "@/services/lib/utils";
import { useAlert } from "@/hooks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Decimal } from "decimal.js";
import { SuperJSON } from "@/services/lib/superjson";

export default function CreateJournalEntryPage() {
  const router = useRouter();
  const alert = useAlert();
  const queryClient = useQueryClient();

  const [newEntry] = useState<CreateJournalEntryData>(() => ({
    id: generateId(),
    entryNumber: "",
    transactionDate: new Date(),
    description: "",
    status: EntryStatus.draft,
    notes: "",
    user: { name: "", email: "" },
    lines: Array.from({ length: 2 }, (_, i) => ({
      id: generateId(),
      accountId: "",
      account: { name: "", code: "" },
      lineNumber: i,
      debitAmount: new Decimal(0),
      creditAmount: new Decimal(0),
      description: "",
      contactId: null,
      contact: null,
    })),
    attachments: [],
  }));

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const res = await getAccounts();
      return Array.isArray(res) ? res : res.data || [];
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await getContacts({ pageSize: 1000 });
      return res.data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const res = await getDepartments();
      return res || [];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await getProjects({ pageSize: 1000 });
      return res?.projects ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: createJournalEntry,
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
        router.push("/accounting/journal-entries");
      } else {
        alert({
          title: "Error",
          description: res.error,
        });
      }
    },
  });

  const handleSubmit = async (data: CreateJournalEntryData) => {
    createMutation.mutate(SuperJSON.serialize(data));
  };

  return (
    <JournalEntryForm
      accounts={accounts}
      contacts={contacts}
      departments={departments}
      projects={projects}
      initialData={newEntry}
      onSubmit={handleSubmit}
      isSubmitting={createMutation.isPending}
      onCancel={() => router.push("/accounting/journal-entries")}
    />
  );
}
