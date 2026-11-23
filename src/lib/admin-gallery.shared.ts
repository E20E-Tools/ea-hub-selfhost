export type AdminImage = {
  path: string;
  name: string;
  folder: string;
  url: string;
  bytes: number | null;
  createdAt: string | null;
  width: number | null;
  height: number | null;
};
export function imageFileSize(bytes: number | null) {
  return bytes === null
    ? "غير متاح"
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
