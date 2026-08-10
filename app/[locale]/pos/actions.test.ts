import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks -------------------------------------------------------
// These must be hoisted so vi.mock can reference them at import time.

const getSessionMock = vi.hoisted(() => vi.fn());
const hasPermissionMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const openMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
    pOSSession: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
    },
    user: {
        findUnique: vi.fn(),
    },
    department: {
        findMany: vi.fn(),
    },
    warehouse: {
        findMany: vi.fn(),
    },
}));

vi.mock("@/lib/auth/auth", () => ({ getSession: getSessionMock }));
vi.mock("@/lib/permissions/utils", () => ({ hasPermission: hasPermissionMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/pos/services/pos-session.service", () => ({
    POSSessionService: { open: openMock },
}));

// Import the actions AFTER the mocks are registered.
import {
    openPOSSession,
    getPOSDepartments,
    getOpenPOSSession,
    getPOSSessions,
} from "./actions";
import { SuperJSON } from "@/services/lib/superjson";

describe("POS session actions — department tag integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: authenticated user with pos.access permission.
        getSessionMock.mockResolvedValue({ userId: "user-1", permissions: ["pos.access"] });
        hasPermissionMock.mockReturnValue(true);
    });

    describe("openPOSSession", () => {
        it("passes departmentId through to POSSessionService.open", async () => {
            openMock.mockResolvedValue({ id: "session-1", sessionNumber: "SES-1" });

            await openPOSSession(100, "cwh0000000000000000000001", "cdept00000000000000000001");

            expect(openMock).toHaveBeenCalledWith("user-1", 100, "cwh0000000000000000000001", "cdept00000000000000000001");
            expect(revalidatePathMock).toHaveBeenCalledWith("/pos");
        });

        it("passes undefined (not null) when no departmentId is supplied", async () => {
            openMock.mockResolvedValue({ id: "session-2", sessionNumber: "SES-2" });

            await openPOSSession(50, "cwh0000000000000000000001");

            // 4th positional arg is undefined — preserves prior warehouse-only behaviour.
            expect(openMock).toHaveBeenCalledWith("user-1", 50, "cwh0000000000000000000001", undefined);
        });

        it("passes null through when explicitly given null", async () => {
            openMock.mockResolvedValue({ id: "session-3", sessionNumber: "SES-3" });

            await openPOSSession(0, "cwh0000000000000000000001", null);

            expect(openMock).toHaveBeenCalledWith("user-1", 0, "cwh0000000000000000000001", null);
        });

        it("throws Unauthorized when the user lacks pos.access", async () => {
            hasPermissionMock.mockReturnValue(false);

            await expect(openPOSSession(100, "wh-1", "dept-1")).rejects.toThrow(
                "Unauthorized",
            );
            expect(openMock).not.toHaveBeenCalled();
        });

        it("serializes the newly created session in the response", async () => {
            const created = { id: "session-4", sessionNumber: "SES-4", departmentId: "dept-1" };
            openMock.mockResolvedValue(created);

            const result = await openPOSSession(100, "cwh0000000000000000000001", "cdept00000000000000000001");
            const deserialized = SuperJSON.deserialize(result);

            expect(deserialized).toMatchObject(created);
        });
    });

    describe("getPOSDepartments", () => {
        it("returns active departments ordered by name", async () => {
            const departments = [
                { id: "dept-1", name: "Front Store", code: "FS" },
                { id: "dept-2", name: "Cafe", code: "CF" },
            ];
            prismaMock.department.findMany.mockResolvedValue(departments);

            const result = await getPOSDepartments();
            const deserialized = SuperJSON.deserialize(result);

            expect(prismaMock.department.findMany).toHaveBeenCalledWith({
                where: { isActive: true },
                orderBy: { name: "asc" },
                select: { id: true, name: true, code: true },
            });
            expect(deserialized).toEqual(departments);
        });

        it("returns an empty serialized array when permission is missing", async () => {
            hasPermissionMock.mockReturnValue(false);

            const result = await getPOSDepartments();
            const deserialized = SuperJSON.deserialize(result);

            expect(deserialized).toEqual([]);
            expect(prismaMock.department.findMany).not.toHaveBeenCalled();
        });
    });

    describe("getOpenPOSSession", () => {
        it("includes the department relation in the query", async () => {
            const posSession = {
                id: "session-1",
                cashierId: "user-1",
                warehouseId: "wh-1",
                warehouse: { id: "wh-1", name: "Main" },
                department: { id: "dept-1", name: "Front Store", code: "FS" },
            };
            prismaMock.pOSSession.findFirst.mockResolvedValue(posSession);
            prismaMock.user.findUnique.mockResolvedValue({ name: "Cashier A" });

            const result = await getOpenPOSSession();
            expect(result).not.toBeNull();
            const deserialized = SuperJSON.deserialize<any>(result!);

            const callArgs = prismaMock.pOSSession.findFirst.mock.calls[0][0];
            expect(callArgs.include.department).toEqual({
                select: { id: true, name: true, code: true },
            });
            // Warehouse relation must still be present (no regression).
            expect(callArgs.include.warehouse).toBe(true);
            expect(deserialized.department).toEqual(posSession.department);
            expect(deserialized.warehouse).toEqual(posSession.warehouse);
        });

        it("returns null when there is no open session", async () => {
            prismaMock.pOSSession.findFirst.mockResolvedValue(null);

            const result = await getOpenPOSSession();
            expect(result).toBeNull();
        });
    });

    describe("getPOSSessions", () => {
        it("includes both warehouse and department in the list query", async () => {
            prismaMock.pOSSession.findMany.mockResolvedValue([]);
            prismaMock.user.findUnique.mockResolvedValue({ name: "Cashier A" });

            await getPOSSessions();

            const callArgs = prismaMock.pOSSession.findMany.mock.calls[0][0];
            // Warehouse must remain selected — no regression on the existing feature.
            expect(callArgs.include.warehouse).toEqual({ select: { name: true } });
            // Department must now be included alongside the warehouse.
            expect(callArgs.include.department).toEqual({
                select: { id: true, name: true, code: true },
            });
        });
    });
});
