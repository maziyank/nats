"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Brain,
  Check,
  ChevronDown,
  Database,
  Loader2,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import { cn } from "@/services/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

type StepStatus = "pending" | "active" | "done";

interface ThinkingStep {
  id: string;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: ThinkingStep[] = [
  {
    id: "understand",
    label: "Understanding your request",
    detail: "Parsing intent, entities, and the business context of your question.",
    icon: Brain,
  },
  {
    id: "plan",
    label: "Planning approach",
    detail: "Choosing the best data sources, tools, and analysis path.",
    icon: Search,
  },
  {
    id: "tools",
    label: "Using business tools",
    detail: "Querying reports, records, and operational data as needed.",
    icon: Wrench,
  },
  {
    id: "analyze",
    label: "Analyzing results",
    detail: "Validating numbers, spotting trends, and checking consistency.",
    icon: Database,
  },
  {
    id: "compose",
    label: "Composing response",
    detail: "Drafting a clear answer with insights and next steps.",
    icon: Sparkles,
  },
];

/** Advance through steps on a cadence that feels busy without finishing too early. */
const STEP_DELAYS_MS = [900, 1600, 2400, 3200, 4200];

function getStepStatus(index: number, activeIndex: number): StepStatus {
  if (index < activeIndex) return "done";
  if (index === activeIndex) return "active";
  return "pending";
}

export function ThinkingProcess() {
  const [open, setOpen] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveNote, setLiveNote] = useState("");

  const notes = useMemo(
    () => [
      "Reviewing conversation context…",
      "Matching request to available ERP modules…",
      "Selecting the most relevant tools…",
      "Cross-checking figures for consistency…",
      "Structuring findings into a clear answer…",
      "Almost ready — finalizing the response…",
    ],
    [],
  );

  useEffect(() => {
    const timers = STEP_DELAYS_MS.map((delay, i) =>
      window.setTimeout(() => {
        // Cap at last step so it keeps "working" until the real response arrives
        setActiveIndex(Math.min(i, STEPS.length - 1));
      }, delay),
    );

    const tick = window.setInterval(() => {
      setElapsedMs((ms) => ms + 100);
    }, 100);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const noteIndex = Math.min(
      Math.floor(elapsedMs / 1800),
      notes.length - 1,
    );
    setLiveNote(notes[noteIndex]);
  }, [elapsedMs, notes]);

  const seconds = (elapsedMs / 1000).toFixed(1);
  const progress = Math.min(
    92,
    ((activeIndex + 1) / STEPS.length) * 70 + Math.min(elapsedMs / 120, 22),
  );

  return (
    <div className="flex w-full gap-3 p-4 flex-row">
      <Avatar className="h-8 w-8 bg-muted shrink-0">
        <AvatarFallback className="bg-muted-foreground/10 text-primary">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>

      <Card className="max-w-[min(100%,28rem)] w-full px-0 py-0 overflow-hidden border-primary/15 bg-gradient-to-br from-muted/60 via-muted/40 to-background shadow-sm">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  Thinking
                  <span className="inline-flex gap-0.5" aria-hidden>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                    <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                    <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                  </span>
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {liveNote}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
              <span className="tabular-nums">{seconds}s</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  open && "rotate-180",
                )}
              />
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/80 transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <ol className="space-y-2.5">
                {STEPS.map((step, index) => {
                  const status = getStepStatus(index, activeIndex);
                  const Icon = step.icon;
                  return (
                    <li
                      key={step.id}
                      className={cn(
                        "flex gap-3 rounded-lg px-2 py-1.5 transition-all duration-300",
                        status === "active" && "bg-primary/5",
                        status === "pending" && "opacity-45",
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        {status === "done" ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                            <Check className="h-3 w-3" />
                          </span>
                        ) : status === "active" ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                            <Loader2 className="h-3 w-3 animate-spin" />
                          </span>
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <Icon className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-sm leading-tight",
                            status === "active"
                              ? "font-medium text-foreground"
                              : status === "done"
                                ? "text-foreground/80"
                                : "text-muted-foreground",
                          )}
                        >
                          {step.label}
                        </p>
                        {status === "active" && (
                          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed animate-in fade-in-0 slide-in-from-top-1 duration-300">
                            {step.detail}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <p className="text-[11px] text-muted-foreground/80 px-2">
                Working through tools and data — this can take a moment for
                complex questions.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
