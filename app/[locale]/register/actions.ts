"use server";

import { prisma } from "@/services/lib/prisma";
import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { sendActivationEmail } from "@/services/lib/mail";

export async function registerUserAndTenant(prevState: unknown, formData: FormData) {
    const fullName = formData.get("fullName") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const companyName = formData.get("companyName") as string; // Optional or mapped to CompanyProfile if needed later

    const errors: { fullName?: string[]; email?: string[]; password?: string[]; companyName?: string[] } = {};

    if (!fullName || fullName.trim().length < 2) {
        errors.fullName = ["Full name is required and should be at least 2 characters"];
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = ["Invalid email address"];
    }

    if (!password || password.length < 6) {
        errors.password = ["Password must be at least 6 characters long"];
    }

    // companyName check can be optional for single-tenant if the company is already set up

    if (Object.keys(errors).length > 0) {
        return { errors };
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (existingUser) {
        return {
            errors: {
                email: ["An account with this email already exists"],
            },
        };
    }

    // Fetch the superadmin role
    const superAdminRole = await prisma.role.findUnique({
        where: { name: "superadmin" },
    });

    if (!superAdminRole) {
        return {
            errors: {
                email: ["System configuration error: superadmin role not found. Please seed the database."],
            },
        };
    }

    try {
        const hashedPassword = await hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name: fullName,
                roleId: superAdminRole.id
            },
        });

        // Generate email verification token
        const token = randomUUID();
        await prisma.verificationToken.create({
            data: {
                identifier: email,
                token,
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
            }
        });

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await sendActivationEmail(email, token, appUrl);

    } catch (error: any) {
        console.error("Registration error:", error);
        return {
            errors: {
                email: ["An unexpected error occurred during registration. Please try again."],
            },
        };
    }

    redirect("/check-email");
}
