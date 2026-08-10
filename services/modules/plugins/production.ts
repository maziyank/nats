import { Factory } from "lucide-react";
import type { ModulePlugin } from "./types";

export const productionPlugin: ModulePlugin = {
    id: "production",
    navigation: [
        {
            section: "Operations",
            items: [
                {
                    title: "Navigation.production",
                    url: "#",
                    icon: Factory,
                    items: [
                        { title: "Production.overview", url: "/production" },
                        { title: "Production.boms", url: "/production/boms" },
                        { title: "Production.orders", url: "/production/orders" },
                        { title: "Production.issues", url: "/production/issues" },
                        { title: "Production.receipts", url: "/production/receipts" },
                        { title: "Production.reports_title", url: "/production/reports" },
                    ],
                },
            ],
        },
    ],
    permissions: [
        {
            name: "production.view",
            description: "Allows viewing production data (BOMs, Orders, Issues, Receipts)",
            module: "production",
        },
        {
            name: "production.create",
            description: "Allows creating production records",
            module: "production",
        },
        {
            name: "production.edit",
            description: "Allows editing and managing production records",
            module: "production",
        },
        {
            name: "production.delete",
            description: "Allows deleting production records",
            module: "production",
        },
    ],
};
