"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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
    <Card className={cn("p-0", className)}>
      <CardHeader className="p-0">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full justify-start p-2 h-auto font-medium hover:bg-transparent rounded-t-xl"
        >
          {isCollapsed ? (
            <ChevronRight className="mr-2 h-4 w-4" />
          ) : (
            <ChevronDown className="mr-2 h-4 w-4" />
          )}
            {isCollapsed ? (
              <CardTitle>{collapsedContent}</CardTitle>
            ) : (
              <CardTitle>
                <div className="text-sm text-muted-foreground">{title}</div>
              </CardTitle>
            )} 
        </Button>
      </CardHeader>
      {!isCollapsed && <CardContent>{children}</CardContent>}
    </Card>
  );
}
