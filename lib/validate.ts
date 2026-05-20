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

export function sanitizePath(filepath: string): string {
  const segments = filepath.split(/[/\\]/).filter(Boolean);
  const sanitized = segments.map((seg, i) => {
    const clean = seg
      .replace(/[^\w.\-() ]+/g, "_")
      .replace(/\s+/g, " ")
      .slice(0, 180);
    return i === segments.length - 1 && !clean.includes(".") ? clean || "file" : clean || "file";
  });
  return sanitized.join("/");
}

export function buildObjectKey(id: string, filename: string, filepath?: string): string {
  if (filepath) {
    const safe = sanitizePath(filepath);
    return `${id}/${safe}`;
  }
  const safe = sanitizeFilename(filename);
  return `${id}/${safe}`;
}

export function assertValidUpload(input: {
  id: string;
  filename: string;
  filepath?: string;
  contentType?: string;
}) {
  if (!isValidNamespaceId(input.id)) {
    throw new Error("Invalid namespace id");
  }

  const filepath = input.filepath || input.filename;
  const safe = sanitizePath(filepath);
  if (!safe || safe === "." || safe === "..") {
    throw new Error("Invalid filename");
  }

  return {
    id: input.id,
    filename: safe,
    contentType: input.contentType || "application/octet-stream",
  };
}