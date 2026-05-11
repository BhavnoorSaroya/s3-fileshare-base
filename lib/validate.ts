// we use this to check for valid upload ids only

const ID_RE = /^\d{4,5}$/;

export function isValidNamespaceId(id: string): boolean {
  return ID_RE.test(id);
}

export function sanitizeFilename(name: string): string {
  const base = name
    .split(/[/\\]/)
    .pop()
    ?.trim() || "file";

  return base
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

export function buildObjectKey(id: string, filename: string): string {
  const safe = sanitizeFilename(filename);
  return `${id}/${safe}`;
}

export function assertValidUpload(input: {
  id: string;
  filename: string;
  contentType?: string;
}) {
  if (!isValidNamespaceId(input.id)) {
    throw new Error("Invalid namespace id");
  }

  const safe = sanitizeFilename(input.filename);
  if (!safe || safe === "." || safe === "..") {
    throw new Error("Invalid filename");
  }

  return {
    id: input.id,
    filename: safe,
    contentType: input.contentType || "application/octet-stream",
  };
}