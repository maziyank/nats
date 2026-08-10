"use server";

import { prisma } from "@/services/lib/prisma";
import { saveFileToDisk, deleteFileFromDisk } from "@/services/lib/file-service";
import { getSession } from "@/services/lib/auth/auth";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

/**
 * Upload a file to local storage.
 *
 * @param formData - FormData containing the file
 * @returns        - Object containing success/error and file info
 */
export async function uploadFile(formData: FormData) {
  const tCommon = await getTranslations("Common");
  const t = await getTranslations("General.Files");
  const session = await getSession();
  if (!session) {
    return { error: tCommon("unauthorized") };
  }

  const file = formData.get("file") as File;

  if (!file) {
    return { error: t("no_file_provided") };
  }

  const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "5242880"); // Default 5MB
  if (file.size > MAX_FILE_SIZE) {
    const sizeInMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(2);
    return { error: t("file_size_exceeds", { size: sizeInMB }) };
  }

  try {
    const { url, filename } = await saveFileToDisk(file);

    const savedFile = await prisma.file.create({
      data: {
        name: file.name,
        url: url,
        mimeType: file.type,
        size: file.size,
        uploadedById: session.userId,
      },
    });

    revalidatePath("/general/files");
    return { success: true, file: savedFile };
  } catch (error) {
    console.error("Upload error:", error);
    return { error: t("upload_error") };
  }
}

/**
 * Delete a file from local storage and database.
 *
 * @param id - The ID of the file to delete
 * @returns  - Success flag or error
 */
export async function deleteFile(id: string) {
  const tCommon = await getTranslations("Common");
  const t = await getTranslations("General.Files");
  const session = await getSession();
  if (!session) {
    return { error: tCommon("unauthorized") };
  }

  try {
    const file = await prisma.file.findUnique({
      where: { id },
    });

    if (!file) {
      return { error: t("file_not_found") };
    }

    await deleteFileFromDisk(file.url);

    await prisma.file.delete({
      where: { id },
    });

    revalidatePath("/general/files");
    return { success: true };
  } catch (error) {
    console.error("Delete error:", error);
    return { error: t("delete_error") };
  }
}

/**
 * Fetch all uploaded files.
 *
 * @returns - List of files with uploader info
 */
export async function getFiles(
  page: number = 1,
  limit: number = 10,
  search?: string,
) {
  const session = await getSession();
  if (!session) return { data: [], total: 0 };

  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { mimeType: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [data, total] = await Promise.all([
    prisma.file.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        uploadedBy: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.file.count({ where }),
  ]);

  return { data, total };
}
