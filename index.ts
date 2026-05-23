import { assertValidUpload, buildObjectKey, isValidNamespaceId } from "./lib/validate";
import { listPrefix, signGetUrl, signPutUrl, deleteObject } from "./lib/s3";

const port = Number(Bun.env.PORT || 3000);
const maxFileSize = Number(Bun.env.MAX_FILE_SIZE || 100 * 1024 * 1024);
const signedUrlTTL = Number(Bun.env.SIGNED_URL_TTL_SECONDS || 300);

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

function badRequest(message: string, status = 400) {
  return json({ error: message }, { status });
}

async function serveStatic(pathname: string): Promise<Response | null> {
  const path = `./public${pathname === "/" ? "/browser.html" : pathname}`;
  const file = Bun.file(path);

  if (await file.exists()) {
    return new Response(file);
  }

  return null;
}

function routeNamespacePage(
  pathname: string,
): { id: string; upload: boolean } | null {
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length === 1) {
    const id = parts[0];

    if (id && isValidNamespaceId(id)) {
      return { id, upload: false };
    }
  }

  if (parts.length === 2) {
    const [id, action] = parts;

    if (id && action === "upload" && isValidNamespaceId(id)) {
      return { id, upload: true };
    }
  }

  return null;
}

Bun.serve({
  port,

  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // LIST FILES
    if (pathname.startsWith("/api/list/")) {
      const id = pathname.split("/").pop();

      if (!id || !isValidNamespaceId(id)) {
        return badRequest("Invalid namespace id");
      }

      const prefix = `${id}/`;
      const files = await listPrefix(prefix);

      return json({
        id,
        prefix,
        files: files.map((f) => ({
          key: f.key,
          name: f.name,
          size: f.size,
          etag: f.etag,
          lastModified: f.lastModified,
        })),
      });
    }

    // SIGN UPLOAD
    // if (pathname === "/api/sign-upload" && req.method === "POST") {
    //   const body: unknown = await req.json().catch(() => null);

    //   if (!body || typeof body !== "object") {
    //     return badRequest("Invalid JSON");
    //   }

    //   try {
    //     const { id, filename, contentType } = assertValidUpload(
    //       body as {
    //         id: string;
    //         filename: string;
    //         filepath?: string;
    //         contentType?: string;
    //       },
    //     );

    //     const filepath = (body as { filepath?: string }).filepath;
    //     const key = buildObjectKey(id, filename, filepath);

    //     const putUrl = await signPutUrl({
    //       key,
    //       contentType,
    //       expiresIn: signedUrlTTL,
    //     });

    //     return json({
    //       id,
    //       key,
    //       putUrl,
    //       headers: {
    //         "content-type": contentType,
    //       },
    //       maxFileSize,
    //       expiresIn: signedUrlTTL,
    //     });
    //   } catch (err) {
    //     return badRequest(
    //       err instanceof Error
    //         ? err.message
    //         : "Invalid upload request",
    //     );
    //   }
    // }

    // DELETE FILE
    // if (pathname.startsWith("/api/delete/") && req.method === "POST") {
    //   const parts = pathname.split("/").filter(Boolean);
    //   if (parts.length < 4) {
    //     return badRequest("Invalid delete path");
    //   }

    //   const id = parts[2];
    //   if (!id || !isValidNamespaceId(id)) {
    //     return badRequest("Invalid namespace id");
    //   }

    //   const name = decodeURIComponent(parts.slice(3).join("/"));
    //   const key = buildObjectKey(id, name);

    //   try {
    //     await deleteObject(key);
    //     return json({ success: true });
    //   } catch (err) {
    //     return json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 500 });
    //   }
    // }

    // DOWNLOAD URL
    if (pathname.startsWith("/api/download-url/")) {
      const parts = pathname.split("/").filter(Boolean);

      if (parts.length < 4) {
        return badRequest("Invalid download path");
      }

      const id = parts[2];

      if (!id || !isValidNamespaceId(id)) {
        return badRequest("Invalid namespace id");
      }

      const name = decodeURIComponent(parts.slice(3).join("/"));

      const key = buildObjectKey(id, name);

      const getUrl = await signGetUrl({
        key,
        expiresIn: signedUrlTTL,
      });

      return json({
        id,
        key,
        url: getUrl,
        expiresIn: signedUrlTTL,
      });
    }

    // NAMESPACE PAGES
    const namespaceRoute = routeNamespacePage(pathname);

    if (namespaceRoute) {
      const html = Bun.file(
        namespaceRoute.upload
          ? "./public/upload.html"
          : "./public/browser.html",
      );

      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    }

    // STATIC FILES
    const staticRes = await serveStatic(pathname);

    if (staticRes) {
      return staticRes;
    }

    return new Response("Not found", {
      status: 404,
    });
  },
});

console.log(`New app on http://localhost:${port}`);