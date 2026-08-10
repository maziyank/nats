"use server";

import { prisma } from "@/services/lib/prisma";
import { hash } from "bcryptjs";
import { redirect } from "next/navigation";

export async function resetPassword(prevState: any, formData: FormData) {
    const token = formData.get("token") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    const errors: { password?: string[]; confirmPassword?: string[]; _form?: string[] } = {};

    if (!token) {
        errors._form = ["Missing or invalid reset token."];
    }

    if (!password || password.length < 8) {
        errors.password = ["Password must be at least 8 characters long"];
    }

    if (password !== confirmPassword) {
        errors.confirmPassword = ["Passwords do not match"];
    }

    if (Object.keys(errors).length > 0) {
        return { errors };
    }

    try {
        const verificationToken = await prisma.verificationToken.findUnique({
            where: { token },
        });

        if (!verificationToken || verificationToken.expires < new Date()) {
            return {
                errors: {
                    _form: ["This password reset link is invalid or has expired."],
                },
            };
        }

        const hashedPassword = await hash(password, 10);

        await prisma.$transaction([
            prisma.user.update({
                where: { email: verificationToken.identifier },
                data: { password: hashedPassword },
            }),
            prisma.verificationToken.delete({
                where: { token },
            }),
        ]);

        return { success: true };
    } catch (error) {
        console.error("Password reset error:", error);
        return {
            errors: {
                _form: ["An unexpected error occurred. Please try again later."],
            },
        };
    }
}
