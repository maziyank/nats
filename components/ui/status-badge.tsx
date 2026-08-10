import { Badge } from "@/components/ui/badge";
import { cn } from "@/services/lib/utils";
import { CheckCircle2, CircleDashed } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const isPosted = status === "posted";

  return (
    <Badge
      variant={isPosted ? "default" : "secondary"}
      className={cn("gap-1.5 capitalize", className)}
    >
      {isPosted ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <CircleDashed className="h-3.5 w-3.5" />
      )}
      {status}
    </Badge>
  );
}
