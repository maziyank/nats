"use server";

import { prisma } from "@/services/lib/prisma";
import { compare, hash } from "bcryptjs";
import { createSession, deleteSession } from "@/services/lib/auth/auth";
import { redirect } from "next/navigation";

export async function login(prevState: unknown, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const errors: { email?: string[]; password?: string[] } = {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = ["Invalid email address"];
  }

  if (!password || password.length < 1) {
    errors.password = ["Password is required"];
  }

  if (Object.keys(errors).length > 0) {
    return {
      errors,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      role: true,
    },
  });

  if (!user) {
    return {
      errors: {
        email: ["User is not registered"],
      },
    };
  }

  const passwordsMatch = await compare(password, user.password);

  if (!passwordsMatch) {
    return {
      errors: {
        email: ["Invalid email or password"],
      },
    };
  }

  if (!user.role || !user.role.isActive) {
    return {
      errors: {
        email: [
          "Your account or role has been deactivated. Please contact support.",
        ],
      },
    };
  }

  await createSession(user.id, user.name, user.role);

  if (user.role.name === "Cashier") {
    redirect("/pos");
  }

  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
}

export async function loginDemo() {
  const email = "demo@nats-accounting.com";
  const password = "demo-password-123";

  let user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  const superAdminRole = await prisma.role.findUnique({
    where: { name: "superadmin" },
  });

  if (!superAdminRole) {
    throw new Error("System configuration error: superadmin role not found");
  }

  if (!user) {
    const hashedPassword = await hash(password, 10);
    user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: "Demo Admin",
        roleId: superAdminRole.id,
      },
      include: { role: true },
    });
  }

  await createSession(user.id, user.name, user.role);
  redirect("/dashboard");
}
