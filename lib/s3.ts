// const bucket = Bun.env.TIGRIS_BUCKET!;
// const endpoint = Bun.env.TIGRIS_ENDPOINT!;
// const accessKeyId = Bun.env.TIGRIS_ACCESS_KEY_ID!;
// const secretAccessKey = Bun.env.TIGRIS_SECRET_ACCESS_KEY!;
// const region = Bun.env.TIGRIS_REGION || "auto";


const bucket = Bun.env.AWS_BUCKET!;
const endpoint = Bun.env.AWS_ENDPOINT!;
const accessKeyId = Bun.env.AWS_ACCESS_KEY_ID!;
const secretAccessKey = Bun.env.AWS_SECRET_ACCESS_KEY!;
const region = Bun.env.AWS_REGION!;

if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
  throw new Error("Missing Tigris S3 environment variables");
}

export const s3 = new Bun.S3Client({
  accessKeyId,
  secretAccessKey,
  bucket,
  endpoint,
  region,
});

export async function listPrefix(prefix: string) {
  const results: Array<{
    key: string;
    size: number;
    etag?: string;
    lastModified?: string;
    name: string;
  }> = [];

  let continuationToken: string | undefined;

  while (true) {
    const page = await s3.list({
      prefix,
      continuationToken,
      maxKeys: 1000,
    });

    for (const obj of page.contents || []) {
      results.push({
        key: obj.key,
        size: obj.size ?? 0,
        etag: obj.eTag,
        lastModified: obj.lastModified,
        name: obj.key.replace(prefix, ""),
      });
    }

    if (!page.isTruncated) {
      break;
    }

    continuationToken = page.nextContinuationToken;
  }

  return results;
}

export async function signPutUrl(params: {
  key: string;
  contentType: string;
  expiresIn: number;
}) {
  const url = s3.presign(params.key, {
    method: "PUT",
    expiresIn: params.expiresIn,
    type : params.contentType,
  });

  return url;
}

export async function signGetUrl(params: {
  key: string;
  expiresIn: number;
}) {
  const url = s3.presign(params.key, {
    method: "GET",
    expiresIn: params.expiresIn,
  });

  return url;
}

export async function deleteObject(key: string) {
  await s3.delete(key);
}
