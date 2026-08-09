import { describe, it, expect, vi, beforeEach } from "vitest";
import { POSSessionService } from "./pos-session.service";
import { Decimal } from "decimal.js";

// Mock prisma with the methods exercised by POSSessionService.
const prismaMock = vi.hoisted(() => ({
    pOSSession: {
        updateMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
    },
    department: {
        findUnique: vi.fn(),
    },
    salesPayment: {
        findMany: vi.fn(),
    },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

describe("POSSessionService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("validateDepartmentId", () => {
        it("returns null when no departmentId is provided (undefined)", async () => {
            const result = await POSSessionService.validateDepartmentId(undefined);
            expect(result).toBeNull();
            expect(prismaMock.department.findUnique).not.toHaveBeenCalled();
        });

        it("returns null when departmentId is null", async () => {
            const result = await POSSessionService.validateDepartmentId(null);
            expect(result).toBeNull();
            expect(prismaMock.department.findUnique).not.toHaveBeenCalled();
        });

        it("returns null when departmentId is an empty string", async () => {
            const result = await POSSessionService.validateDepartmentId("");
            expect(result).toBeNull();
            expect(prismaMock.department.findUnique).not.toHaveBeenCalled();
        });

        it("returns the department id when the department exists and is active", async () => {
            prismaMock.department.findUnique.mockResolvedValue({
                id: "dept-1",
                isActive: true,
            });

            const result = await POSSessionService.validateDepartmentId("dept-1");
            expect(result).toBe("dept-1");
            expect(prismaMock.department.findUnique).toHaveBeenCalledWith({
                where: { id: "dept-1" },
                select: { id: true, isActive: true },
            });
        });

        it("throws when the department does not exist", async () => {
            prismaMock.department.findUnique.mockResolvedValue(null);

            await expect(
                POSSessionService.validateDepartmentId("missing-dept"),
            ).rejects.toThrow(/Invalid department tag/);
        });

        it("throws when the department exists but is inactive", async () => {
            prismaMock.department.findUnique.mockResolvedValue({
                id: "dept-2",
                isActive: false,
            });

            await expect(
                POSSessionService.validateDepartmentId("dept-2"),
            ).rejects.toThrow(/Invalid department tag/);
        });
    });

    describe("open", () => {
        const mockUserId = "user-1";
        const mockWarehouseId = "cwh0000000000000000000001";

        it("creates a session with a department tag when a valid departmentId is provided", async () => {
            prismaMock.department.findUnique.mockResolvedValue({
                id: "dept-1",
                isActive: true,
            });
            const created = {
                id: "session-1",
                sessionNumber: "SES-123",
                departmentId: "dept-1",
                warehouseId: mockWarehouseId,
            };
            prismaMock.pOSSession.create.mockResolvedValue(created);

            const result = await POSSessionService.open(
                mockUserId,
                100,
                mockWarehouseId,
                "dept-1",
            );

            // Existing open sessions should still be closed first.
            expect(prismaMock.pOSSession.updateMany).toHaveBeenCalledWith({
                where: { cashierId: mockUserId, status: "OPEN" },
                data: { status: "CLOSED", endTime: expect.any(Date) },
            });

            // Department must be validated before creation.
            expect(prismaMock.department.findUnique).toHaveBeenCalledWith({
                where: { id: "dept-1" },
                select: { id: true, isActive: true },
            });

            // The created session must include both warehouse and department.
            expect(prismaMock.pOSSession.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    cashierId: mockUserId,
                    warehouseId: mockWarehouseId,
                    departmentId: "dept-1",
                    status: "OPEN",
                }),
            });
            expect(result).toEqual(created);
        });

        it("creates a session without a department tag when departmentId is omitted (regression guard)", async () => {
            const created = {
                id: "session-2",
                sessionNumber: "SES-124",
                departmentId: null,
                warehouseId: mockWarehouseId,
            };
            prismaMock.pOSSession.create.mockResolvedValue(created);

            const result = await POSSessionService.open(
                mockUserId,
                50,
                mockWarehouseId,
            );

            expect(prismaMock.department.findUnique).not.toHaveBeenCalled();
            expect(prismaMock.pOSSession.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    cashierId: mockUserId,
                    warehouseId: mockWarehouseId,
                    departmentId: null,
                    status: "OPEN",
                }),
            });
            expect(result).toEqual(created);
        });

        it("rejects opening a session when the department tag is invalid", async () => {
            prismaMock.department.findUnique.mockResolvedValue(null);

            await expect(
                POSSessionService.open(mockUserId, 100, mockWarehouseId, "bad-dept"),
            ).rejects.toThrow(/Invalid department tag/);

            // Must not create a session when validation fails.
            expect(prismaMock.pOSSession.create).not.toHaveBeenCalled();
        });

        it("still attaches the warehouse when a department tag is provided", async () => {
            prismaMock.department.findUnique.mockResolvedValue({
                id: "dept-1",
                isActive: true,
            });
            prismaMock.pOSSession.create.mockResolvedValue({ id: "session-3" });

            await POSSessionService.open(
                mockUserId,
                0,
                mockWarehouseId,
                "dept-1",
            );

            const createCall = prismaMock.pOSSession.create.mock.calls[0][0];
            expect(createCall.data.warehouseId).toBe(mockWarehouseId);
            expect(createCall.data.departmentId).toBe("dept-1");
        });
    });

    describe("updateDepartment", () => {
        const mockSessionId = "session-1";

        it("updates the department tag of an existing session with a valid department", async () => {
            prismaMock.department.findUnique.mockResolvedValue({
                id: "dept-2",
                isActive: true,
            });
            prismaMock.pOSSession.findUnique.mockResolvedValue({
                id: mockSessionId,
                warehouseId: "wh-1",
            });
            prismaMock.pOSSession.update.mockResolvedValue({
                id: mockSessionId,
                departmentId: "dept-2",
            });

            const result = await POSSessionService.updateDepartment(
                mockSessionId,
                "dept-2",
            );

            expect(prismaMock.department.findUnique).toHaveBeenCalledWith({
                where: { id: "dept-2" },
                select: { id: true, isActive: true },
            });
            expect(prismaMock.pOSSession.update).toHaveBeenCalledWith({
                where: { id: mockSessionId },
                data: { departmentId: "dept-2" },
            });
            expect(result.departmentId).toBe("dept-2");
        });

        it("clears the department tag when called with no departmentId", async () => {
            prismaMock.pOSSession.findUnique.mockResolvedValue({
                id: mockSessionId,
                warehouseId: "wh-1",
            });
            prismaMock.pOSSession.update.mockResolvedValue({
                id: mockSessionId,
                departmentId: null,
            });

            const result = await POSSessionService.updateDepartment(
                mockSessionId,
                null,
            );

            expect(prismaMock.department.findUnique).not.toHaveBeenCalled();
            expect(prismaMock.pOSSession.update).toHaveBeenCalledWith({
                where: { id: mockSessionId },
                data: { departmentId: null },
            });
            expect(result.departmentId).toBeNull();
        });

        it("rejects updating to an invalid department tag", async () => {
            prismaMock.department.findUnique.mockResolvedValue({
                id: "dept-3",
                isActive: false,
            });

            await expect(
                POSSessionService.updateDepartment(mockSessionId, "dept-3"),
            ).rejects.toThrow(/Invalid department tag/);

            expect(prismaMock.pOSSession.update).not.toHaveBeenCalled();
        });
    });

    describe("close (warehouse/department regression guard)", () => {
        it("closes a session and computes cash totals without touching department/warehouse fields", async () => {
            prismaMock.salesPayment.findMany.mockResolvedValue([
                { amount: new Decimal(50) },
                { amount: new Decimal(25) },
            ]);
            prismaMock.pOSSession.findUnique.mockResolvedValue({
                id: "cses000000000000000000001",
                openingCash: new Decimal(100),
                warehouseId: "wh-1",
                departmentId: "dept-1",
            });
            prismaMock.pOSSession.update.mockResolvedValue({});

            await POSSessionService.close("cses000000000000000000001", 175, "Closing note");

            const updateCall = prismaMock.pOSSession.update.mock.calls[0][0];
            // The close path must NOT mutate warehouseId or departmentId.
            expect(updateCall.data).not.toHaveProperty("warehouseId");
            expect(updateCall.data).not.toHaveProperty("departmentId");
            expect(updateCall.data.status).toBe("CLOSED");
            expect(updateCall.data.notes).toBe("Closing note");
            // closingCash = openingCash(100) + cashSales(75) = 175
            expect(updateCall.data.closingCash.toString()).toBe("175");
            // difference = actualCash(175) - systemCash(175) = 0
            expect(updateCall.data.difference.toString()).toBe("0");
        });
    });
});
