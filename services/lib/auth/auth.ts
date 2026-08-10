import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/routing";
import { getLocale } from "next-intl/server";

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("FATAL: SESSION_SECRET environment variable is not set!");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  userName: string;
  roleId: string;
  role: string; // Storing role name
  permissions: string[];
  expiresAt: Date;
};

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function decrypt(session: string | undefined = "") {
  try {
    const { payload } = await jwtVerify(session, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(
  userId: string,
  userName: string,
  role: { id: string; name: string; permissions: string[] }
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({
    userId,
    userName,
    roleId: role.id,
    role: role.name,
    permissions: role.permissions,
    expiresAt,
  });
  const cookieStore = await cookies();

  cookieStore.set("session", session, {
    httpOnly: true,
    // Secure cookies are required in production; allow plain HTTP in local dev.
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  const payload = await decrypt(session);

  if (!session || !payload) {
    return null;
  }

  return {
    isAuth: true,
    userId: payload.userId,
    userName: payload.userName,
    roleId: payload.roleId,
    role: payload.role,
    permissions: payload.permissions,
  };
}

export async function verifySession() {
  const session = await getSession();

  if (!session) {
    const locale = await getLocale();
    redirect({ href: "/auth", locale });
  }

  return session!;
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
