"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ReportPreview } from "./report-preview";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/services/lib/utils";

interface ReportPreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  input: any;
  title?: string;
  description?: string;
}

export function ReportPreviewDialog({
  isOpen,
  onOpenChange,
  code,
  input,
  title = "Report Preview",
  description,
}: ReportPreviewDialogProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex flex-col gap-0 p-0 sm:max-w-4xl transition-all duration-300",
          isFullscreen ? "h-[100vh] max-w-[100vw] w-screen rounded-none border-0" : "h-[90vh] w-[90vw]"
        )}
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b px-6 py-4 space-y-0">
          <div className="flex flex-col gap-1">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-muted/10 p-4">
          {/* 
               If the dialog is closed, we might still be rendering if we don't check isOpen, 
               but Dialog handles mounting/unmounting usually. 
               However, passing input={null} or similar might be needed to reset state if the component doesn't unmount.
               Here we rely on Dialog unmounting content or at least hiding it. 
            */}
          {isOpen && (
            <ReportPreview
              code={code}
              input={input}
              className="h-full border shadow-none"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
