"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { disposeAsset } from "../actions";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Account } from "@/prisma/generated/prisma/browser";
import { useQuery } from "@tanstack/react-query";
import { getAccounts } from "@/app/[locale]/(dashboard)/accounting/accounts/actions";
import { SuperJSON } from "@/services/lib/superjson";

interface DisposeAssetDialogProps {
  assetId: string;
  assetName: string;
}

export function DisposeAssetDialog({ assetId, assetName }: DisposeAssetDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [depositAccountId, setDepositAccountId] = useState("");

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const result = await getAccounts();
      return SuperJSON.deserialize<Account[]>(result as any);
    },
    enabled: open
  });

  const handleDispose = async () => {
    if (!depositAccountId && amount > 0) {
        toast({ title: "Error", description: "Please select a deposit account for the proceeds.", variant: "destructive" });
        return;
    }

    setIsLoading(true);
    try {
        const userId = "user_1"; // Mock user
        const result = await disposeAsset(assetId, new Date(date), amount, reason, depositAccountId, userId);
        if (result.success) {
            toast({ title: "Asset Disposed" });
            setOpen(false);
        } else {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        }
    } catch (error) {
        toast({ title: "Error", description: "Failed to dispose asset", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  const assetAccounts = accounts?.filter(a => a.type === "asset" || a.type === "equity") || []; // Cash/Bank are assets

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Dispose / Sell
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispose Asset: {assetName}</DialogTitle>
          <DialogDescription>
            Record the sale or disposal of this asset. This action is irreversible.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="date">Disposal Date</Label>
                <Input 
                    id="date" 
                    type="date" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)} 
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="amount">Sale Amount (0 if scrapped)</Label>
                <Input 
                    id="amount" 
                    type="number" 
                    step="0.01"
                    value={amount} 
                    onChange={(e) => setAmount(parseFloat(e.target.value))} 
                />
            </div>
            {amount > 0 && (
                <div className="space-y-2">
                    <Label htmlFor="depositAccount">Deposit To Account</Label>
                    <Select value={depositAccountId} onValueChange={setDepositAccountId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select Account" />
                        </SelectTrigger>
                        <SelectContent>
                            {assetAccounts.map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.code})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div className="space-y-2">
                <Label htmlFor="reason">Reason / Notes</Label>
                <Textarea 
                    id="reason" 
                    value={reason} 
                    onChange={(e) => setReason(e.target.value)} 
                />
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDispose} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Disposal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
