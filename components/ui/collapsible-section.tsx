"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  collapsedContent?: React.ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
}

export function CollapsibleSection({
  title,
  children,
  collapsedContent,
  defaultCollapsed = false,
  className,
}: CollapsibleSectionProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);

  return (
    <div className={cn("border rounded-lg bg-card", className)}>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full justify-start p-2 h-auto font-medium hover:bg-muted bg-muted/50 rounded-none rounded-t-lg"
      >
        {isCollapsed ? (
          <ChevronRight className="mr-2 h-4 w-4" />
        ) : (
          <ChevronDown className="mr-2 h-4 w-4" />
        )}
        {title}
      </Button>
      {isCollapsed && collapsedContent && (
        <div className="px-4 pb-3 pt-2">{collapsedContent}</div>
      )}
      {!isCollapsed && <div className="px-4 pb-4 pt-2">{children}</div>}
    </div>
  );
}
