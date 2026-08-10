"use client";
export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getJournalEntry } from "../actions";
import { JournalEntryDetails } from "../_components/journal-entry-details";
import { Loader2 } from "lucide-react";
import { SuperJSON } from "@/services/lib/superjson";
import { JournalEntryWithDetails } from "../../types";

export default function JournalEntryDetailsPage() {
  const params = useParams<{ id: string }>();

  const {
    data: entry,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["journal-entry", params?.id],
    queryFn: async () => {
      if (!params?.id) throw new Error("ID is required");
      const res = await getJournalEntry(params.id);
      if (!res.success) {
        throw new Error(res.error || "Journal entry not found");
      }
      if (!res.data) {
        throw new Error("Journal entry not found");
      }
      return SuperJSON.deserialize<JournalEntryWithDetails>(res.data);
    },
    enabled: !!params?.id,
    retry: false,
  });

  if (isError) {
    notFound();
  }

  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entry) return null;

  return <JournalEntryDetails entry={entry} />;
}
