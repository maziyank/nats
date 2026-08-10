"use client";

import { useQuery } from "@tanstack/react-query";
import { getWarehouse } from "../actions";
import { LocationTable } from "./location-table";
import { LocationDialog } from "./location-dialog";
import { Protect } from "@/components/ui/protect";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SuperJSON } from "@/services/lib/superjson";
import { Warehouse } from "@/prisma/generated/prisma/browser";
import { SuperJSONResult } from "superjson";

interface LocationsViewProps {
  warehouseId: string;
}

export function LocationsView({ warehouseId }: LocationsViewProps) {
  const { data: warehouseData } = useQuery({
    queryKey: ["warehouse", warehouseId],
    queryFn: () => getWarehouse(warehouseId),
  });

  const warehouse = warehouseData
    ? SuperJSON.deserialize<Warehouse>(warehouseData as SuperJSONResult)
    : null;

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory/warehouses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">
            {warehouse?.name} - Storage Bins
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage storage bins for this location
          </p>
        </div>
        <Protect permission="warehouses.edit">
          <LocationDialog warehouseId={warehouseId} />
        </Protect>
      </div>
      <LocationTable warehouseId={warehouseId} />
    </div>
  );
}
