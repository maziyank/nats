"use client";
export const dynamic = "force-dynamic";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { getAsset, activateAsset } from "../actions";
import { SuperJSON } from "@/services/lib/superjson";
import { Asset, AssetCategory, DepreciationSchedule, AssetDisposal } from "@/prisma/generated/prisma/browser";
import { useFormatCurrency, useFormatDate } from "@/hooks";
import { Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

import { DisposeAssetDialog } from "../_components/dispose-asset-dialog";

type AssetWithDetails = Asset & {
  category: AssetCategory;
  depreciationSchedules: DepreciationSchedule[];
  disposal: AssetDisposal | null;
};

export default function AssetDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();
  const router = useRouter();
  const { toast } = useToast();

  const { data: asset, isLoading, refetch } = useQuery({
    queryKey: ["asset", id],
    queryFn: async () => {
      const serialized = await getAsset(id);
      return serialized ? SuperJSON.deserialize<AssetWithDetails>(serialized) : null;
    },
  });

  const handleActivate = async () => {
    const result = await activateAsset(id);
    if (result.success) {
      toast({ title: "Asset Activated" });
      refetch();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }



  return asset && (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/assets">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{asset.name}</h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>{asset.code}</span>
            <span>•</span>
            <Badge variant="outline">{asset.category.name}</Badge>
            <span>•</span>
            <Badge variant={asset.status === "ACTIVE" ? "default" : "secondary"}>
              {asset.status}
            </Badge>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {asset.status === "DRAFT" && (
            <Button onClick={handleActivate}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Activate Asset
            </Button>
          )}
          {asset.status === "ACTIVE" && (
            <DisposeAssetDialog assetId={asset.id} assetName={asset.name} />
          )}
          <Button variant="outline">Edit</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Purchase Date</p>
              <p>{formatDate(asset.purchaseDate)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Acquisition Cost</p>
              <p>{formatCurrency(Number(asset.acquisitionCost))}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Residual Value</p>
              <p>{formatCurrency(Number(asset.residualValue))}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Useful Life</p>
              <p>{asset.usefulLife} months</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Depreciation Method</p>
              <p>{asset.depreciationMethod.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Current Book Value</p>
              <p className="font-bold">{formatCurrency(Number(asset.currentBookValue))}</p>
            </div>
            {asset.serialNumber && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Serial Number</p>
                <p>{asset.serialNumber}</p>
              </div>
            )}
            {asset.location && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Location</p>
                <p>{asset.location}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Category Name</p>
              <p>{asset.category.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Code</p>
              <p>{asset.category.code}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Depreciation Schedule</CardTitle>
          <CardDescription>
            projected and posted depreciation events.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Book Value After</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {asset.depreciationSchedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>{formatDate(schedule.date)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(schedule.amount))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(schedule.bookValueAfter))}</TableCell>
                  <TableCell>
                    {schedule.isPosted ? (
                      <Badge variant="default">Posted</Badge>
                    ) : (
                      <Badge variant="outline">Scheduled</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
