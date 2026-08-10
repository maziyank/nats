import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as Minio from "minio";

interface FileStorage {
  saveFile(file: File): Promise<{ url: string; filename: string }>;
  deleteFile(url: string): Promise<void>;
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

class LocalStorage implements FileStorage {
  async saveFile(file: File): Promise<{ url: string; filename: string }> {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    // Sanitize filename or just use UUID
    const ext = path.extname(file.name);
    const filename = `${randomUUID()}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    await fs.writeFile(filepath, buffer);

    return {
      url: `/uploads/${filename}`,
      filename: filename,
    };
  }

  async deleteFile(url: string): Promise<void> {
    // Extract filename from URL (assuming /uploads/filename.ext)
    const filename = url.split("/").pop();
    if (!filename) return;

    // Security check: ensure no directory traversal
    const filepath = path.join(UPLOAD_DIR, filename);

    // Ensure the resolved path is still within UPLOAD_DIR
    if (!filepath.startsWith(UPLOAD_DIR)) {
      console.error(
        "Security warning: Attempted path traversal in deleteFileFromDisk"
      );
      return;
    }

    try {
      await fs.unlink(filepath);
    } catch (error) {
      // Ignore error if file doesn't exist
      console.error("Error deleting file from disk:", error);
    }
  }
}

class MinioStorage implements FileStorage {
  private client: Minio.Client;
  private bucketName: string;

  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || "localhost",
      port: parseInt(process.env.MINIO_PORT || "9000"),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY || "",
      secretKey: process.env.MINIO_SECRET_KEY || "",
    });
    this.bucketName = process.env.MINIO_BUCKET_NAME || "default-bucket";
  }

  async saveFile(file: File): Promise<{ url: string; filename: string }> {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName);
        // Do not force a public-read policy. Prefer private buckets +
        // presigned URLs / reverse-proxy for document access.
        // Opt-in public read only when explicitly configured.
        if (process.env.MINIO_PUBLIC_READ === "true") {
          const policy = {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { AWS: ["*"] },
                Action: ["s3:GetObject"],
                Resource: [`arn:aws:s3:::${this.bucketName}/*`],
              },
            ],
          };
          await this.client.setBucketPolicy(
            this.bucketName,
            JSON.stringify(policy),
          );
        }
      }
    } catch (e) {
      console.error("Error checking/creating bucket:", e);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name);
    const filename = `${randomUUID()}${ext}`;

    const metaData = {
      "Content-Type": file.type,
    };

    await this.client.putObject(
      this.bucketName,
      filename,
      buffer,
      buffer.length,
      metaData
    );

    // Construct URL
    const protocol = process.env.MINIO_USE_SSL === "true" ? "https" : "http";
    // Prefer public endpoint if configured (e.g. for external access), else internal endpoint
    const host =
      process.env.MINIO_PUBLIC_ENDPOINT ||
      process.env.MINIO_ENDPOINT ||
      "localhost";
    const port =
      process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || "9000";

    // Omit port if standard
    const portStr = port === "80" || port === "443" || !port ? "" : `:${port}`;

    const url = `${protocol}://${host}${portStr}/${this.bucketName}/${filename}`;

    return {
      url,
      filename,
    };
  }

  async deleteFile(url: string): Promise<void> {
    const parts = url.split("/");
    const filename = parts.pop();
    if (!filename) return;

    try {
      await this.client.removeObject(this.bucketName, filename);
    } catch (error) {
      console.error("Error deleting file from MinIO:", error);
    }
  }
}

function getStorage(): FileStorage {
  const driver = process.env.STORAGE_DRIVER || "local";
  if (driver === "minio") {
    return new MinioStorage();
  }
  return new LocalStorage();
}

export async function saveFile(
  file: File
): Promise<{ url: string; filename: string }> {
  return getStorage().saveFile(file);
}

export async function deleteFile(url: string): Promise<void> {
  return getStorage().deleteFile(url);
}

// Backward compatibility
export const saveFileToDisk = saveFile;
export const deleteFileFromDisk = deleteFile;
