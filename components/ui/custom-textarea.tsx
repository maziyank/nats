"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/services/lib/utils";

export interface CustomTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  containerClassName?: string;
}

const CustomTextarea = React.forwardRef<
  HTMLTextAreaElement,
  CustomTextareaProps
>(({ className, containerClassName, label, id, ...props }, ref) => {
  const generatedId = React.useId();
  const textareaId = id || generatedId;

  return (
    <div className={cn("space-y-1", containerClassName)}>
      {label && <Label htmlFor={textareaId}>{label}</Label>}
      <Textarea id={textareaId} className={className} ref={ref} {...props} />
    </div>
  );
});
CustomTextarea.displayName = "CustomTextarea";

export { CustomTextarea };
