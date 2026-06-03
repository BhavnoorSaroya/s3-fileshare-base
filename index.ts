import { assertValidUpload, buildObjectKey, isValidNamespaceId } from "./lib/validate";
import { listPrefix, signGetUrl, signPutUrl, deleteObject } from "./lib/s3";

const port = Number(Bun.env.PORT || 3000);
const maxFileSize = Number(Bun.env.MAX_FILE_SIZE || 100 * 1024 * 1024);
const signedUrlTTL = Number(Bun.env.SIGNED_URL_TTL_SECONDS || 300);

const allowedOrigins = new Set([
  "https://byte.5ab.dev",
  "https://internal.5ab.dev",
  "https://www.bytecamp.ca",
  "https://bytecamp.ca",
  "http://localhost:3000"
]);

function getCorsHeaders(origin: string | null) {
  if (!origin || !allowedOrigins.has(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(res: Response, origin: string | null) {
  const headers = new Headers(res.headers);

  for (const [key, value] of Object.entries(getCorsHeaders(origin))) {
    headers.set(key, value);
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

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
    const origin = req.headers.get("origin");

    // CORS preflight
    if (req.method === "OPTIONS") {
      return withCors(
        new Response(null, {
          status: 204,
        }),
        origin,
      );
    }

    try {
      const url = new URL(req.url);
      const { pathname } = url;

      let response: Response;

      // LIST FILES
      if (pathname.startsWith("/api/list/")) {
        const id = pathname.split("/").pop();

        if (!id || !isValidNamespaceId(id)) {
          response = badRequest("Invalid namespace id");
          return withCors(response, origin);
        }

        const prefix = `${id}/`;
        const files = await listPrefix(prefix);

        response = json({
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

        return withCors(response, origin);
      }

      // SIGN UPLOAD
      if (pathname === "/api/sign-upload" && req.method === "POST") {
        const body: unknown = await req.json().catch(() => null);

        if (!body || typeof body !== "object") {
          response = badRequest("Invalid JSON");
          return withCors(response, origin);
        }

        try {
          const { id, filename, contentType } = assertValidUpload(
            body as {
              id: string;
              filename: string;
              filepath?: string;
              contentType?: string;
            },
          );

          const filepath = (body as { filepath?: string }).filepath;
          const key = buildObjectKey(id, filename, filepath);

          const putUrl = await signPutUrl({
            key,
            contentType,
            expiresIn: signedUrlTTL,
          });

          response = json({
            id,
            key,
            putUrl,
            headers: {
              "content-type": contentType,
            },
            maxFileSize,
            expiresIn: signedUrlTTL,
          });

          return withCors(response, origin);
        } catch (err) {
          response = badRequest(
            err instanceof Error
              ? err.message
              : "Invalid upload request",
          );

          return withCors(response, origin);
        }
      }

      // DELETE FILE
      if (pathname.startsWith("/api/delete/") && req.method === "POST") {
        const parts = pathname.split("/").filter(Boolean);

        if (parts.length < 4) {
          response = badRequest("Invalid delete path");
          return withCors(response, origin);
        }

        const id = parts[2];

        if (!id || !isValidNamespaceId(id)) {
          response = badRequest("Invalid namespace id");
          return withCors(response, origin);
        }

        const name = decodeURIComponent(parts.slice(3).join("/"));
        const key = buildObjectKey(id, name);

        try {
          await deleteObject(key);

          response = json({
            success: true,
          });

          return withCors(response, origin);
        } catch (err) {
          response = json(
            {
              error:
                err instanceof Error ? err.message : "Delete failed",
            },
            {
              status: 500,
            },
          );

          return withCors(response, origin);
        }
      }

      // DOWNLOAD URL
      if (pathname.startsWith("/api/download-url/")) {
        const parts = pathname.split("/").filter(Boolean);

        if (parts.length < 4) {
          response = badRequest("Invalid download path");
          return withCors(response, origin);
        }

        const id = parts[2];

        if (!id || !isValidNamespaceId(id)) {
          response = badRequest("Invalid namespace id");
          return withCors(response, origin);
        }

        const name = decodeURIComponent(parts.slice(3).join("/"));
        const key = buildObjectKey(id, name);

        const getUrl = await signGetUrl({
          key,
          expiresIn: signedUrlTTL,
        });

        response = json({
          id,
          key,
          url: getUrl,
          expiresIn: signedUrlTTL,
        });

        return withCors(response, origin);
      }

      // NAMESPACE PAGES
      const namespaceRoute = routeNamespacePage(pathname);

      if (namespaceRoute) {
        response = new Response(
          Bun.file(
            namespaceRoute.upload
              ? "./public/upload.html"
              : "./public/browser.html",
          ),
          {
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          },
        );

        return withCors(response, origin);
      }

      // STATIC FILES
      const staticRes = await serveStatic(pathname);

      if (staticRes) {
        return withCors(staticRes, origin);
      }

      response = new Response("Not found", {
        status: 404,
      });

      return withCors(response, origin);
    } catch (err) {
      return withCors(
        json(
          {
            error:
              err instanceof Error
                ? err.message
                : "Internal server error",
          },
          {
            status: 500,
          },
        ),
        origin,
      );
    }
  },
});

console.log(`New app on http://localhost:${port}`);