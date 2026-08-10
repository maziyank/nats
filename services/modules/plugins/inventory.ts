import { Archive } from "lucide-react";
import type { ModulePlugin } from "./types";

export const inventoryPlugin: ModulePlugin = {
  id: "inventory",
  navigation: [
    {
      section: "Operations",
      items: [
        {
          title: "Navigation.inventory",
          url: "#",
          icon: Archive,
          items: [
            { title: "Inventory.overview", url: "/inventory" },
            { title: "Inventory.products", url: "/inventory/products" },
            { title: "Inventory.pricing", url: "/inventory/pricing" },
            { title: "Inventory.categories", url: "/inventory/categories" },
            { title: "Inventory.warehouses", url: "/inventory/warehouses" },
            { title: "Inventory.movements", url: "/inventory/movements" },
            { title: "Inventory.uom", url: "/inventory/uom" },
            { title: "Inventory.reports_title", url: "/inventory/products/reports" },
          ],
        },
      ],
    },
  ],
  permissions: [
    {
      name: "inventory.view",
      description: "Allows viewing inventory levels and movements",
      module: "inventory",
    },
    {
      name: "inventory_movements.create",
      description:
        "Allows creating inventory movements (IN, OUT, TRANSFER, ADJUSTMENT)",
      module: "inventory",
    },
    {
      name: "warehouses.create",
      description: "Allows creating new warehouses",
      module: "warehouses",
    },
    {
      name: "warehouses.edit",
      description: "Allows editing warehouse details",
      module: "warehouses",
    },
    {
      name: "warehouses.delete",
      description: "Allows deleting warehouses",
      module: "warehouses",
    },
    {
      name: "products.view",
      description: "Allows viewing product details",
      module: "products",
    },
    {
      name: "products.create",
      description: "Allows creating new products",
      module: "products",
    },
    {
      name: "products.edit",
      description: "Allows editing product details",
      module: "products",
    },
    {
      name: "products.delete",
      description: "Allows deleting products",
      module: "products",
    },
    {
      name: "categories.create",
      description: "Allows creating new product categories",
      module: "categories",
    },
    {
      name: "categories.edit",
      description: "Allows editing product categories",
      module: "categories",
    },
    {
      name: "categories.delete",
      description: "Allows deleting product categories",
      module: "categories",
    },
    {
      name: "inventory_products.edit",
      description: "Allows editing inventory product units of measure",
      module: "products",
    },
    {
      name: "inventory_products.delete",
      description: "Allows deleting inventory product units of measure",
      module: "products",
    },
  ],
};

