"use client";
export const dynamic = "force-dynamic";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SuperJSON } from "@/services/lib/superjson";
import { Protect } from "@/components/ui/protect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Ban,
  Eye,
  Loader2,
  LockOpen,
  MoreHorizontal,
  Play,
  RotateCcw,
  Send,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useFormatDate } from "@/hooks";
import { Prisma } from "@/prisma/generated/prisma/browser";
import {
  dispatchIntegrationOutboxBatch,
  bulkRequeueIntegrationOutboxEvents,
  bulkForceDeadIntegrationOutboxEvents,
  bulkUnlockStuckIntegrationOutboxEvents,
  forceDeadIntegrationOutboxEvent,
  getOutboxAuditLogs,
  getIntegrationOutboxTopErrors,
  getIntegrationOutboxEventDetail,
  getIntegrationOutboxEvents,
  requeueIntegrationOutboxEvent,
  runIntegrationOutboxEventNow,
  unlockIntegrationOutboxEvent,
} from "./actions";
import {
  PageListActions,
  PageListContent,
  PageListFilter,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import { OutboxFilters } from "./_components/outbox-filters";
import { OutboxEventDialog } from "./_components/outbox-event-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type OutboxEvent = {
  id: string;
  topic: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  status: string;
  attempts: number;
  lockedAt: Date | null;
  lockedBy: string | null;
  nextAttemptAt: Date | null;
  processedAt: Date | null;
  lastError: string | null;
  deadAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  payload: unknown;
};

type OutboxAuditLog = Prisma.AuditLogGetPayload<object>;

function statusVariant(status: string) {
  if (status === "PROCESSED") return "default";
  if (status === "FAILED") return "destructive";
  if (status === "DEAD") return "destructive";
  if (status === "PROCESSING") return "secondary";
  return "outline";
}

export default function IntegrationOutboxPage() {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const confirm = useConfirm();
  const formatDate = useFormatDate();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  // Filters from URL
  const status = searchParams.get("status") || "";
  const search = searchParams.get("search") || "";
  const topic = searchParams.get("topic") || "";
  const type = searchParams.get("type") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);

  const [dialog, setDialog] = useState<{
    open: boolean;
    title: string;
    content: unknown;
    event?: OutboxEvent | null;
  }>({ open: false, title: "", content: null, event: null });

  // Queries
  const queryKey = useMemo(
    () => ["admin-outbox", page, search, status, topic, type],
    [page, search, status, topic, type],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getIntegrationOutboxEvents(page, 20, {
        search,
        status,
        topic,
        type,
      });
      return {
        events: Array.isArray(result.events)
          ? result.events
          : SuperJSON.deserialize<OutboxEvent[]>(result.events),
        total: result.total,
        totalPages: result.totalPages,
      };
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: auditData, isLoading: isLoadingAudit } = useQuery({
    queryKey: ["admin-outbox-audit", 1], // Just first page for simplified view
    queryFn: async () => {
      const result = await getOutboxAuditLogs({ page: 1, pageSize: 15 });
      if (!result.success || !result.data) return { logs: [], total: 0 };
      const logs = Array.isArray(result.data.logs)
        ? result.data.logs
        : SuperJSON.deserialize<OutboxAuditLog[]>(result.data.logs);
      return { logs, total: result.data.total };
    },
  });

  const { data: errorsData, isLoading: isLoadingErrors } = useQuery({
    queryKey: ["admin-outbox-errors", topic, type],
    queryFn: async () =>
      getIntegrationOutboxTopErrors({
        topic: topic || undefined,
        type: type || undefined,
        limit: 8,
      }),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-outbox"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-outbox-errors"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-outbox-audit"] });
  };

  // Actions
  const handleRunNow = (id: string) => {
    startTransition(async () => {
      const result = await runIntegrationOutboxEventNow(id);
      if (result.success) {
        toast({ title: t("dispatched") });
        await invalidate();
      } else {
        toast({
          title: tCommon("error"),
          description: result.error,
          variant: "destructive",
        });
      }
    });
  };

  const handleDispatchBatch = () => {
    startTransition(async () => {
      const result = await dispatchIntegrationOutboxBatch(50);
      if (result.success) {
        toast({
          title: t("dispatched"),
          description: t("dispatch_desc", {
            attempted: (result as any).result?.attempted ?? 0,
            processed: (result as any).result?.processed ?? 0,
            failed: (result as any).result?.failed ?? 0,
          }),
        });
        await invalidate();
      } else {
        toast({ title: t("failed_dispatch"), variant: "destructive" });
      }
    });
  };

  const handleBulkUnlock = async () => {
    if (
      await confirm({
        title: t("unlock_stuck"),
        description: t("bulk_unlock_stuck_desc"),
        confirmText: t("unlock"),
      })
    ) {
      startTransition(async () => {
        const result = await bulkUnlockStuckIntegrationOutboxEvents({
          topic: topic || undefined,
          type: type || undefined,
        });
        if (result.success) {
          toast({
            title: t("bulk_unlocked"),
            description: t("updated_count", {
              count: (result as any).count ?? 0,
            }),
          });
          await invalidate();
        }
      });
    }
  };

  const handleBulkRequeue = async (
    fromStatus: "FAILED" | "DEAD",
    reset: boolean,
  ) => {
    if (
      await confirm({
        title: reset ? t("requeue_reset") : t("requeue_keep"),
        description: t("bulk_requeue_desc"),
        confirmText: reset ? t("requeue_reset") : t("requeue_keep"),
      })
    ) {
      startTransition(async () => {
        const result = await bulkRequeueIntegrationOutboxEvents({
          fromStatus,
          resetAttempts: reset,
          topic: topic || undefined,
          type: type || undefined,
        });
        if (result.success) {
          toast({
            title: t("bulk_requeued"),
            description: t("updated_count", {
              count: (result as any).count ?? 0,
            }),
          });
          await invalidate();
        }
      });
    }
  };

  const handleBulkMarkDeadByError = async (error: string) => {
    if (
      await confirm({
        title: t("mark_dead"),
        description: t("bulk_dead_error_desc"),
        confirmText: t("mark_dead"),
        variant: "destructive",
      })
    ) {
      startTransition(async () => {
        const result = await bulkForceDeadIntegrationOutboxEvents({
          lastErrorExact: error,
          topic: topic || undefined,
          type: type || undefined,
        });
        if (result.success) {
          toast({
            title: t("bulk_marked_dead"),
            description: t("updated_count", {
              count: (result as any).count ?? 0,
            }),
          });
          await invalidate();
        }
      });
    }
  };

  const handleRequeueEvent = async (id: string, reset: boolean) => {
    if (
      await confirm({
        title: t("requeue_event"),
        description: t("requeue_desc"),
        confirmText: reset ? t("requeue_reset") : t("requeue_keep"),
      })
    ) {
      startTransition(async () => {
        const result = await requeueIntegrationOutboxEvent(id, {
          resetAttempts: reset,
        });
        if (result.success) {
          toast({ title: tCommon("success") });
          await invalidate();
        }
      });
    }
  };

  const handleUnlockEvent = async (id: string) => {
    if (
      await confirm({
        title: t("unlock_event"),
        description: t("unlock_desc"),
        confirmText: t("unlock"),
      })
    ) {
      startTransition(async () => {
        const result = await unlockIntegrationOutboxEvent(id);
        if (result.success) {
          toast({ title: tCommon("success") });
          await invalidate();
        }
      });
    }
  };

  const handleMarkDead = async (id: string) => {
    if (
      await confirm({
        title: t("move_dead_letter"),
        description: t("move_dead_desc"),
        confirmText: t("mark_dead"),
        variant: "destructive",
      })
    ) {
      startTransition(async () => {
        const result = await forceDeadIntegrationOutboxEvent(id);
        if (result.success) {
          toast({ title: tCommon("success") });
          await invalidate();
        }
      });
    }
  };

  const columns: Column<OutboxEvent>[] = [
    {
      header: tCommon("status"),
      cell: (item) => (
        <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
      ),
      className: "w-[120px]",
    },
    {
      header: tCommon("type"),
      cell: (item) => (
        <div className="min-w-[240px]">
          <div className="font-medium text-xs">{item.type}</div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {item.topic}
          </div>
        </div>
      ),
    },
    {
      header: "Aggregate",
      cell: (item) => (
        <div className="min-w-[150px] font-mono text-xs">
          {item.aggregateId || "—"}
        </div>
      ),
    },
    {
      header: tCommon("attempts"),
      cell: (item) => (
        <div className="w-[80px] text-right">{item.attempts}</div>
      ),
    },
    {
      header: tCommon("created_at"),
      cell: (item) => (
        <div className="w-[160px] text-xs font-light">
          {formatDate(item.createdAt, { includeTime: true })}
        </div>
      ),
    },
    {
      header: "",
      cell: (item) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  setDialog({
                    open: true,
                    title: t("view_details"),
                    content: item,
                    event: item,
                  })
                }
              >
                <Eye className="mr-2 h-4 w-4" /> {t("view_details")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <Protect permission="integrations.outbox.dispatch">
                <DropdownMenuItem onClick={() => handleRunNow(item.id)}>
                  <Play className="mr-2 h-4 w-4 text-green-500" />{" "}
                  {t("run_now")}
                </DropdownMenuItem>
              </Protect>
              <Protect permission="integrations.outbox.retry">
                <DropdownMenuItem
                  onClick={() => handleRequeueEvent(item.id, true)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> {t("requeue_reset")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleRequeueEvent(item.id, false)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> {t("requeue_keep")}
                </DropdownMenuItem>
                {item.status === "PROCESSING" && (
                  <DropdownMenuItem onClick={() => handleUnlockEvent(item.id)}>
                    <LockOpen className="mr-2 h-4 w-4" /> {t("unlock")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => handleMarkDead(item.id)}
                >
                  <Ban className="mr-2 h-4 w-4" /> {t("mark_dead")}
                </DropdownMenuItem>
              </Protect>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      className: "w-[60px]",
    },
  ];

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title={t("integration_outbox")} />
        <PageListActions className="space-x-1">
          <Protect permission="integrations.outbox.retry">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isPending}>
                  {t("bulk_actions")} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {t("filtered_by")}: topic={topic || "any"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleBulkUnlock}>
                  <LockOpen className="mr-2 h-4 w-4" /> {t("unlock_stuck")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleBulkRequeue("FAILED", true)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />{" "}
                  {t("requeue_failed_reset")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleBulkRequeue("FAILED", false)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />{" "}
                  {t("requeue_failed_keep")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleBulkRequeue("DEAD", true)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />{" "}
                  {t("requeue_dead_reset")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleBulkRequeue("DEAD", false)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />{" "}
                  {t("requeue_dead_keep")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Protect>
          <Protect permission="integrations.outbox.dispatch">
            <Button onClick={handleDispatchBatch} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {t("dispatch_pending")}
            </Button>
          </Protect>
        </PageListActions>
      </PageListHeader>

      <PageListFilter>
        <OutboxFilters />
      </PageListFilter>

      <PageListContent>
        <DataTable
          data={data?.events ?? []}
          columns={columns}
          isLoading={isLoading}
          pagination={{
            totalEntries: data?.total ?? 0,
            pageSize: 20,
            currentPage: page,
          }}
        />
      </PageListContent>

      <PageListContent className="border-0 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{t("top_failed_errors")}</CardTitle>
            <div className="text-[10px] text-muted-foreground">
              {topic ? `topic=${topic}` : "topic=any"}
            </div>
          </CardHeader>
          <CardContent className="text-sm">
            {isLoadingErrors ? (
              <div className="text-muted-foreground">
                {tCommon("loading")}...
              </div>
            ) : errorsData?.errors?.length ? (
              <div className="flex flex-col gap-3">
                {errorsData.errors.map((e, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-2 border-b pb-2 last:border-0"
                  >
                    <div className="flex-1 overflow-hidden">
                      <code className="block truncate bg-muted p-1 text-[10px] font-mono whitespace-pre-wrap break-all max-h-[60px] overflow-y-auto">
                        {e.lastError}
                      </code>
                      <div className="mt-1 flex items-center gap-2 text-[10px]">
                        <span className="font-bold text-destructive">
                          {e.count} {t("events")}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Protect permission="integrations.outbox.retry">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => handleBulkMarkDeadByError(e.lastError)}
                          title={t("mark_dead")}
                        >
                          <Ban className="h-3 w-3" />
                        </Button>
                      </Protect>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">
                {t("no_failed_errors")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("audit_trail")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            {isLoadingAudit ? (
              <div className="text-muted-foreground">
                {tCommon("loading")}...
              </div>
            ) : auditData?.logs?.length ? (
              <div className="space-y-3">
                {auditData.logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col gap-0.5 border-b pb-1.5 last:border-0"
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span>{log.action}</span>
                      <span className="text-[10px] font-normal text-muted-foreground font-mono">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                    <div className="text-muted-foreground leading-snug">
                      {log.userId || "System"} • {log.ipAddress || "local"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">{t("no_audit_logs")}</div>
            )}
          </CardContent>
        </Card>
      </PageListContent>

      <OutboxEventDialog
        event={dialog.event ?? null}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </PageListLayout>
  );
}
