import { describe, it, expect, vi, beforeEach } from "vitest";
import { InventoryService, CreateInventoryMovementData } from "./inventory.service";
import { MovementType, Prisma } from "@/prisma/generated/prisma/client";
import { Decimal } from "decimal.js";

// Mock dependencies
const enqueueIntegrationEventOnceMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/integration/outbox", () => ({
    enqueueIntegrationEventOnce: enqueueIntegrationEventOnceMock,
}));

const prismaMock = {
    warehouse: {
        findFirst: vi.fn(),
    },
    inventoryMovement: {
        create: vi.fn(),
        update: vi.fn(),
        findUniqueOrThrow: vi.fn(),
    },
    inventoryMovementDetail: {
        create: vi.fn(),
        createMany: vi.fn(),
    },
    inventory: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        groupBy: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    },
    product: {
        findMany: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
    },
} as unknown as Prisma.TransactionClient;

describe("InventoryService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("createInventoryMovement", () => {
        const mockDate = new Date("2024-01-01T00:00:00.000Z");

        it("should create an IN movement and update stock correctly", async () => {
            const input: CreateInventoryMovementData = {
                type: MovementType.IN,
                items: [
                    { productId: "cprod000000000000000000001", quantity: 10, unitCost: 100 }
                ],
                warehouseId: "cwh0000000000000000000001",
                transactionDate: mockDate,
            };

            const mockMovement = {
                id: "mov-1",
                type: MovementType.IN,
                transactionDate: mockDate,
                toWarehouseId: "cwh0000000000000000000001",
            };
            (prismaMock.inventoryMovement.create as any).mockResolvedValue(mockMovement);

            (prismaMock.product.findMany as any).mockResolvedValue([
                { id: "cprod000000000000000000001", name: "Product 1", sku: "SKU-1", averageCost: new Decimal(100) },
            ]);
            (prismaMock.inventory.findMany as any).mockResolvedValue([
                {
                    id: "inv-1",
                    productId: "cprod000000000000000000001",
                    warehouseId: "cwh0000000000000000000001",
                    batchNumber: null,
                    quantity: 5,
                    unitCost: new Decimal(100),
                },
            ]);
            (prismaMock.inventory.groupBy as any).mockResolvedValue([
                { productId: "cprod000000000000000000001", _sum: { quantity: 5 } },
            ]);

            const result = await InventoryService.createInventoryMovement(prismaMock, input);

            expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    type: MovementType.IN,
                    toWarehouseId: "cwh0000000000000000000001",
                    status: "COMPLETED",
                }),
            });

            expect(prismaMock.inventoryMovementDetail.createMany).toHaveBeenCalledWith({
                data: [
                    expect.objectContaining({
                        inventoryMovementId: "mov-1",
                        productId: "cprod000000000000000000001",
                        quantity: 10,
                        unitCost: 100,
                    }),
                ],
            });

            expect(prismaMock.inventory.update).toHaveBeenCalledWith({
                where: { id: "inv-1" },
                data: {
                    quantity: { increment: 10 },
                    unitCost: new Decimal(100),
                },
            });

            // Initial: 5 @ 100 = 500; Incoming: 10 @ 100 = 1000; Avg = 100
            expect(prismaMock.product.update).toHaveBeenCalledWith({
                where: { id: "cprod000000000000000000001" },
                data: { averageCost: new Decimal(100) },
            });

            expect(enqueueIntegrationEventOnceMock).toHaveBeenCalledWith(prismaMock, expect.objectContaining({
                topic: "INVENTORY",
                type: "INVENTORY_MOVEMENT_CREATED",
                aggregateId: "mov-1",
            }));

            expect(result).toEqual(mockMovement);
        });

        it("should create an OUT movement and decrement stock if sufficient", async () => {
            const input: CreateInventoryMovementData = {
                type: MovementType.OUT,
                items: [
                    { productId: "cprod000000000000000000001", quantity: 2 }
                ],
                warehouseId: "cwh0000000000000000000001",
                transactionDate: mockDate,
            };

            const mockMovement = {
                id: "mov-2",
                type: MovementType.OUT,
                transactionDate: mockDate,
                fromWarehouseId: "cwh0000000000000000000001",
            };
            (prismaMock.inventoryMovement.create as any).mockResolvedValue(mockMovement);

            (prismaMock.product.findMany as any).mockResolvedValue([
                { id: "cprod000000000000000000001", name: "Product 1", sku: "SKU-1", averageCost: new Decimal(100) },
            ]);
            (prismaMock.inventory.findMany as any).mockResolvedValue([
                {
                    id: "inv-1",
                    productId: "cprod000000000000000000001",
                    warehouseId: "cwh0000000000000000000001",
                    batchNumber: null,
                    quantity: 10,
                    unitCost: new Decimal(100),
                },
            ]);
            (prismaMock.inventory.groupBy as any).mockResolvedValue([
                { productId: "cprod000000000000000000001", _sum: { quantity: 10 } },
            ]);

            await InventoryService.createInventoryMovement(prismaMock, input);

            expect(prismaMock.inventory.update).toHaveBeenCalledWith({
                where: { id: "inv-1" },
                data: {
                    quantity: { decrement: 2 },
                },
            });
            // OUT no longer rescans inventory layers or rewrites product average cost
            expect(prismaMock.product.update).not.toHaveBeenCalled();
        });

        it("should throw error if insufficient stock for OUT movement", async () => {
            const input: CreateInventoryMovementData = {
                type: MovementType.OUT,
                items: [
                    { productId: "cprod000000000000000000001", quantity: 20 }
                ],
                warehouseId: "cwh0000000000000000000001",
            };

            const mockMovement = { id: "mov-3", type: MovementType.OUT };
            (prismaMock.inventoryMovement.create as any).mockResolvedValue(mockMovement);

            (prismaMock.product.findMany as any).mockResolvedValue([
                { id: "cprod000000000000000000001", name: "Product 1", sku: "SKU-1", averageCost: new Decimal(100) },
            ]);
            (prismaMock.inventory.findMany as any).mockResolvedValue([
                {
                    id: "inv-1",
                    productId: "cprod000000000000000000001",
                    warehouseId: "cwh0000000000000000000001",
                    batchNumber: null,
                    quantity: 10,
                    unitCost: new Decimal(100),
                },
            ]);
            (prismaMock.inventory.groupBy as any).mockResolvedValue([
                { productId: "cprod000000000000000000001", _sum: { quantity: 10 } },
            ]);

            await expect(InventoryService.createInventoryMovement(prismaMock, input))
                .rejects
                .toThrow("Insufficient stock for product Product 1 (SKU: SKU-1). Available: 10, Requested: 20");
        });
    });
});