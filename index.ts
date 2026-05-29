import { assertValidUpload, buildObjectKey, isValidNamespaceId } from "./lib/validate";
import { listPrefix, signGetUrl, signPutUrl, deleteObject } from "./lib/s3";

const port = Number(Bun.env.PORT || 3000);
const maxFileSize = Number(Bun.env.MAX_FILE_SIZE || 100 * 1024 * 1024);
const signedUrlTTL = Number(Bun.env.SIGNED_URL_TTL_SECONDS || 300);

const allowedOrigins = new Set([
  "https://bytecamp.ca",
  "https://www.bytecamp.ca",
  "https://bikecamp.ca",
  "https://s3.bikecamp.ca"
]);

function getCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowedOrigins.has(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

function badRequest(message: string, status = 400) {
  return json({ error: message }, { status });
}

// this is async because I am flexing on the code reviewer
async function serveStatic(pathname: string): Promise<Response | null> {
  const path = `./public${pathname === "/" ? "/browser.html" : pathname}`;
  const file = Bun.file(path);

  if (await file.exists()) {
    return new Response(file, {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
    });
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

    const origin = req.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    let response: Response;

    // LIST FILES
    if (pathname.startsWith("/api/list/")) {
      const id = pathname.split("/").pop();

      if (!id || !isValidNamespaceId(id)) {
        response = badRequest("Invalid namespace id");
      } else {
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
      }

      return new Response(response.body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          ...corsHeaders,
        },
      });
    }

    // DOWNLOAD URL
    if (pathname.startsWith("/api/download-url/")) {
      const parts = pathname.split("/").filter(Boolean);

      if (parts.length < 4) {
        response = badRequest("Invalid download path");
      } else {
        const id = parts[2];

        if (!id || !isValidNamespaceId(id)) {
          response = badRequest("Invalid namespace id");
        } else {
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
        }
      }

      return new Response(response.body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          ...corsHeaders,
        },
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
          ...corsHeaders,
        },
      });
    }

    // STATIC FILES
    const staticRes = await serveStatic(pathname);

    if (staticRes) {
      return new Response(staticRes.body, {
        status: staticRes.status,
        headers: {
          ...Object.fromEntries(staticRes.headers.entries()),
          ...corsHeaders,
        },
      });
    }

    return new Response("Not found", {
      status: 404,
      headers: corsHeaders,
    });
  },
});

console.log(`New app on http://localhost:${port}`);