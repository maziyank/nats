"use client";
export const dynamic = "force-dynamic";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { JournalEntryForm } from "../../_components/journal-entry-form";
import { getJournalEntry, updateJournalEntry } from "../../actions";
import { getAccounts } from "../../../accounts/actions";
import { getContacts } from "@/app/[locale]/(dashboard)/general/contacts/actions";
import { getDepartments, getProjects } from "@/app/[locale]/(dashboard)/general/actions";
import {
  CreateJournalEntryData,
  JournalEntryWithDetails,
} from "../../../types";
import { useAlert } from "@/hooks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SuperJSON } from "@/services/lib/superjson";

export default function EditJournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const alert = useAlert();
  const queryClient = useQueryClient();

  const { data: entry, isLoading: isEntryLoading } = useQuery({
    queryKey: ["journal-entry", id],
    queryFn: async () => {
      const res = await getJournalEntry(id);
      return res.success && res.data
        ? SuperJSON.deserialize<JournalEntryWithDetails>(res.data)
        : null;
    },
  });

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

  const updateMutation = useMutation({
    mutationFn: (data: CreateJournalEntryData) =>
      updateJournalEntry(id, SuperJSON.serialize(data)),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
        queryClient.invalidateQueries({ queryKey: ["journal-entry", id] });
        router.push("/accounting/journal-entries");
      } else {
        alert({
          title: "Error",
          description: res.error,
        });
      }
    },
  });

  // Check posted status
  useEffect(() => {
    if (entry && entry.status === "posted") {
      alert({
        title: "Cannot edit",
        description: "Cannot edit posted journal entries",
      }).then(() => {
        router.push(`/accounting/journal-entries/${id}`);
      });
    }
  }, [entry, router, alert, id]);

  if (isEntryLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!entry) {
    return <div className="p-8 text-center">Journal Entry not found</div>;
  }

  // Prevent rendering form if posted (useEffect will redirect, but good to hide)
  if (entry.status === "posted") {
    return null;
  }

  const handleSubmit = async (data: CreateJournalEntryData) => {
    updateMutation.mutate(data);
  };

  const initialData: CreateJournalEntryData | undefined = entry
    ? {
      ...entry,
      lines: entry.lines.map((line) => ({
        id: line.id,
        accountId: line.accountId,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        description: line.description || undefined,
        contactId: line.contactId,
        departmentId: line.departmentId,
        projectId: line.projectId,
        lineNumber: line.lineNumber,
        account: { name: line.account.name, code: line.account.code },
        contact: line.contact ? { name: line.contact.name } : null,
        department: line.department ? { name: line.department.name } : null,
        project: line.project ? { name: line.project.name } : null,
      })),
      attachments: entry.attachments.map((att) => ({
        id: att.id,
        name: att.name,
        url: att.url,
        size: att.size,
        type: att.mimeType,
      })),
    }
    : undefined;

  return (
    <JournalEntryForm
      initialData={initialData}
      accounts={accounts}
      contacts={contacts}
      departments={departments}
      projects={projects}
      onSubmit={handleSubmit}
      isSubmitting={updateMutation.isPending}
      onCancel={() => router.push("/accounting/journal-entries")}
    />
  );
}
