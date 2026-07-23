const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_IMAGE_BYTES = 1_500_000; // keeps individual D1 rows small

export function isAllowedImageType(contentType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(contentType);
}

export function arrayBufferToDataUrl(buffer: ArrayBuffer, contentType: string): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return `data:${contentType};base64,${btoa(chunks.join(''))}`;
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: match[1] };
}
