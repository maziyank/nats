import { prisma } from "../../services/lib/prisma";

export { prisma };

export async function clearDatabase() {
    // Optional: Add logic to clear database if needed, though usually we utilize upsert or just seed on top.
    // For now, we will rely on upsert idempotency.
}
