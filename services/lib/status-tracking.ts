import { prisma } from "@/services/lib/prisma";

export type UserNameRef = { name: string } | null;

export async function resolveUserNames(
  userIds: Array<string | null | undefined>,
) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) {
    return new Map<string, string>();
  }

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });

  return new Map(users.map((user) => [user.id, user.name]));
}

export function userNameRef(
  userId: string | null | undefined,
  nameById: Map<string, string>,
): UserNameRef {
  if (!userId) return null;
  return { name: nameById.get(userId) || userId };
}

export function buildStatusActorRefs(
  fields: Record<string, string | null | undefined>,
  nameById: Map<string, string>,
) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, userId]) => [
      key,
      userNameRef(userId, nameById),
    ]),
  ) as Record<string, UserNameRef>;
}
