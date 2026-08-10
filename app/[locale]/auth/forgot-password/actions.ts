"use server";

import { prisma } from "@/services/lib/prisma";
import { sendResetPasswordEmail } from "@/services/lib/mail";
import { randomBytes } from "crypto";
import { headers } from "next/headers";

export async function requestPasswordReset(prevState: any, formData: FormData) {
    const email = formData.get("email") as string;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return {
            errors: {
                email: ["Invalid email address"],
            },
        };
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        // Even if user doesn't exist, we should probably return success to avoid email enumeration
        // but for this specific request "Selesaikan fitur Forgot Password", I'll implement the logic properly.
        if (user) {
            const token = randomBytes(32).toString("hex");
            const expires = new Date(Date.now() + 3600000); // 1 hour from now

            await prisma.verificationToken.create({
                data: {
                    identifier: email,
                    token,
                    expires,
                },
            });

            const host = (await headers()).get("host");
            const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
            const baseUrl = `${protocol}://${host}`;

            await sendResetPasswordEmail(email, token, baseUrl);
        }

        return {
            success: true,
            email,
        };
    } catch (error) {
        console.error("Password reset request error:", error);
        return {
            errors: {
                _form: ["An unexpected error occurred. Please try again later."],
            },
        };
    }
}
