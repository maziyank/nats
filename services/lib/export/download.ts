/**
 * Trigger a browser file download from a base64 payload.
 * Prefer downloadBlob / the binary export API for large files.
 */
export function downloadBase64File(
  base64: string,
  filename: string,
  mimeType: string,
) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  downloadBlob(new Blob([bytes], { type: mimeType }), filename);
}

/**
 * Trigger a browser file download from a Blob (binary path — no base64).
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Client-side CSV download helper (no server round-trip).
 * Prefer server export for rate limiting / large datasets.
 */
export function downloadCsvClient(
  csvContent: string,
  filename: string,
) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
