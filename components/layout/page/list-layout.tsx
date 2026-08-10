import { Protect } from "@/components/ui/protect";
import { cn } from "@/services/lib/utils";
import { Button } from "@base-ui/react";
import { Link, Plus } from "lucide-react";

export function PageListLayout({
  className,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      className={cn("flex flex-1 flex-col gap-2 p-4 pt-0", className)}
      {...props}
    />
  );
}

export function PageListHeader({
  className,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    />
  );
}

export function PageListTitle({
  className,
  title,
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <h2 className={cn("text-lg font-bold tracking-tight", className)}>
      {title}
    </h2>
  );
}

export function PageListActions({
  className,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return <div className={className} {...props} />;
}

export function PageListContent({
  className,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return <div className={cn("rounded-md border", className)} {...props} />;
}

export function PageListFilter({
  className,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      className={cn("flex items-end gap-4 flex-wrap", className)}
      {...props}
    />
  );
}
