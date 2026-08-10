import { redirect } from "next/navigation";
import { prisma } from "@/services/lib/prisma";
import { createSession } from "@/services/lib/auth/auth";
import { Button } from "@/components/ui/button";
import { XCircle, CheckCircle2, GalleryVerticalEnd } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default async function VerifyEmailPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const sp = await searchParams;
    const token = typeof sp.token === "string" ? sp.token : null;

    let isSuccess = false;
    let errorMessage = "Invalid or missing token.";

    if (token) {
        try {
            const verificationToken = await prisma.verificationToken.findUnique({
                where: { token }
            });

            if (!verificationToken) {
                errorMessage = "This activation link is invalid or has already been used.";
            } else if (verificationToken.expires < new Date()) {
                errorMessage = "This activation link has expired. Please register again.";
            } else {
                // Update user email verified date
                const user = await prisma.user.findUnique({
                    where: { email: verificationToken.identifier },
                    include: {
                        role: true
                    }
                });

                if (user && user.role) {
                    await prisma.$transaction([
                        prisma.user.update({
                            where: { id: user.id },
                            data: { emailVerified: new Date() }
                        }),
                        prisma.verificationToken.delete({
                            where: { token }
                        })
                    ]);

                    await createSession(user.id, user.name, user.role);
                    isSuccess = true;
                } else {
                    errorMessage = "Account not found.";
                }
            }
        } catch (e) {
            console.error(e);
            errorMessage = "An unexpected error occurred.";
        }
    }

    if (isSuccess) {
        redirect("/dashboard");
    }

    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex justify-center gap-2 md:justify-start">
                    <Link href="/" className="flex items-center gap-2 font-medium">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                            <GalleryVerticalEnd className="size-4" />
                        </div>
                        NATS Inc.
                    </Link>
                </div>
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-sm">
                        <div className="text-center flex flex-col items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-red-500">
                                <XCircle className="h-6 w-6" />
                            </div>
                            <h1 className="text-2xl font-bold">Verification Failed</h1>
                            <p className="text-balance text-sm text-muted-foreground">
                                {errorMessage}
                            </p>
                            <Link href="/auth" className="w-full">
                                <Button className="w-full mt-4">
                                    Return to Sign In
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
            <div className="relative hidden bg-muted lg:block">
                <Image
                    src="https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                    alt="Image"
                    fill
                    sizes="50vw"
                    className="object-cover dark:brightness-[0.2] dark:grayscale"
                />
            </div>
        </div>
    );
}
