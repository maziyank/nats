
"use client";

import { Button } from "@/components/ui/button";
import { submitBudgetForApproval, approveBudgetAction } from "@/app/[locale]/(dashboard)/budgeting/actions";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Budget, BudgetApproval } from "@/prisma/generated/prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useMemo } from "react";

interface BudgetActionsProps {
  budget: SuperJSONResult;
  currentUserId: string;
}

export function BudgetActions({ budget: budgetData, currentUserId }: BudgetActionsProps) {
  const budget = useMemo(() => SuperJSON.deserialize<Budget & { approvals: BudgetApproval[] }>(budgetData), [budgetData]);

  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const latestApproval = budget.approvals[0];
  const isPendingApproval = budget.status === "PENDING_APPROVAL";
  const isDraft = budget.status === "DRAFT" || budget.status === "REJECTED";

  // Logic to determine if current user can approve
  // This is simplified. Ideally we check roles.
  // For now, let's assume anyone can approve for demo purposes, or check if user is NOT the creator?
  // Real implementation: check if user.role matches approval.role (DEPT_HEAD, FINANCE, CFO)
  const canApprove = isPendingApproval && latestApproval?.status === "PENDING";

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await submitBudgetForApproval(budget.id);
      toast({ title: "Submitted", description: "Budget submitted for approval." });
      router.refresh();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!latestApproval) return;
    setLoading(true);
    try {
      await approveBudgetAction(budget.id, latestApproval.id, "APPROVED");
      toast({ title: "Approved", description: "Budget approved successfully." });
      router.refresh();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!latestApproval) return;
    setLoading(true);
    try {
      await approveBudgetAction(budget.id, latestApproval.id, "REJECTED", rejectReason);
      toast({ title: "Rejected", description: "Budget rejected." });
      setRejectDialogOpen(false);
      router.refresh();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex space-x-2">
      {isDraft && (
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? "Submitting..." : "Submit for Approval"}
        </Button>
      )}

      {canApprove && (
        <>
          <Button onClick={handleApprove} disabled={loading} variant="default" className="bg-green-600 hover:bg-green-700">
            Approve
          </Button>
          <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={loading}>Reject</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject Budget</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Reason for Rejection</Label>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Please explain why..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleReject} disabled={!rejectReason || loading}>
                  Confirm Rejection
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
