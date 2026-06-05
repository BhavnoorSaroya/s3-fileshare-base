import { assertValidUpload, buildObjectKey, isValidNamespaceId } from "./lib/validate";
import { listPrefix, signGetUrl, signPutUrl, deleteObject } from "./lib/s3";
import { jwtVerify, SignJWT } from "jose";

const port = Number(Bun.env.PORT || 3000);
const maxFileSize = Number(Bun.env.MAX_FILE_SIZE || 100 * 1024 * 1024);
const signedUrlTTL = Number(Bun.env.SIGNED_URL_TTL_SECONDS || 300);
const sessionSecret = Bun.env.AUTH_SESSION_SECRET;
const oauthClientId = Bun.env.OAUTH_CLIENT_ID;
const oauthClientSecret = Bun.env.OAUTH_CLIENT_SECRET;
const allowedGoogleDomain = Bun.env.ALLOWED_GOOGLE_DOMAIN || "bytecamp.ca";
const sessionCookieName = "upload_session";
const oauthStateCookieName = "upload_oauth_state";
const oauthStateTTL = 10 * 60;
const sessionTTL = 7 * 24 * 60 * 60;
const textEncoder = new TextEncoder();
const oauthScopes = ["openid", "email", "profile"].join(" ");

type SessionPayload = {
  email: string;
  name: string;
  picture?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  hd?: string;
};

const allowedOrigins = new Set([
  "https://byte.5ab.dev",
  "https://internal.5ab.dev",
  "https://www.bytecamp.ca",
  "https://bytecamp.ca",
  "https://s3download.fly.dev",
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
    "Access-Control-Allow-Credentials": "true",
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

function unauthorized(message = "Unauthorized") {
  return json({ error: message }, { status: 401 });
}

function serverError(message: string, status = 500) {
  return json({ error: message }, { status });
}

function redirect(location: string, init?: ResponseInit) {
  const headers = new Headers();

  appendResponseHeaders(headers, init?.headers);

  headers.set("location", location);

  return new Response(null, {
    status: 302,
    ...init,
    headers,
  });
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie");

  if (!cookie) {
    return null;
  }

  for (const part of cookie.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

function appendSetCookie(headers: Headers, cookie: string) {
  headers.append("set-cookie", cookie);
}

function appendResponseHeaders(target: Headers, source: ResponseInit["headers"]) {
  if (!source) {
    return;
  }

  if (source instanceof Headers) {
    source.forEach((value, key) => {
      target.append(key, value);
    });
    return;
  }

  if (Array.isArray(source)) {
    for (const [key, value] of source) {
      target.append(key, value);
    }
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    target.append(key, value);
  }
}

function buildCookie(name: string, value: string, maxAge: number, sameSite: "Lax" | "None") {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    `SameSite=${sameSite}`,
    `Max-Age=${maxAge}`,
  ];

  return parts.join("; ");
}

function clearCookie(name: string, sameSite: "Lax" | "None") {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=0`;
}

function getRequestOrigin(req: Request) {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const url = new URL(req.url);
  return url.origin;
}

function getOAuthRedirectUri(req: Request) {
  const configured = Bun.env.OAUTH_REDIRECT_URI;
  return configured || `${getRequestOrigin(req)}/auth/google/callback`;
}

function buildGoogleLoginUrl(req: Request, state: string, returnTo: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", oauthClientId || "");
  url.searchParams.set("redirect_uri", getOAuthRedirectUri(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", oauthScopes);
  url.searchParams.set("state", `${state}:${base64UrlEncode(returnTo)}`);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("hd", allowedGoogleDomain);
  return url.toString();
}

function sanitizeReturnTo(returnTo: string | null) {
  if (!returnTo || !returnTo.startsWith("/")) {
    return "/";
  }

  if (returnTo.startsWith("//")) {
    return "/";
  }

  return returnTo;
}

async function createSessionToken(payload: SessionPayload) {
  if (!sessionSecret) {
    throw new Error("AUTH_SESSION_SECRET is not configured");
  }

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionTTL}s`)
    .sign(textEncoder.encode(sessionSecret));
}

async function verifySessionToken(token: string | null) {
  if (!token || !sessionSecret) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, textEncoder.encode(sessionSecret), {
      algorithms: ["HS256"],
    });

    const payload = verified.payload;
    if (typeof payload.email !== "string" || typeof payload.name !== "string") {
      return null;
    }

    return {
      email: payload.email,
      name: payload.name,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
    } satisfies SessionPayload;
  } catch {
    return null;
  }
}

async function requireSession(req: Request) {
  return await verifySessionToken(getCookie(req, sessionCookieName));
}

function buildStateValue() {
  return crypto.randomUUID();
}

function createOauthStateCookie(state: string) {
  return buildCookie(oauthStateCookieName, state, oauthStateTTL, "Lax");
}

async function exchangeCodeForTokens(req: Request, code: string) {
  const redirectUri = getOAuthRedirectUri(req);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: oauthClientId || "",
      client_secret: oauthClientSecret || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await res.json()) as GoogleTokenResponse;

  if (!res.ok || !payload.access_token) {
    console.error("Google token exchange failed", {
      status: res.status,
      redirectUri,
      error: payload.error,
      errorDescription: payload.error_description,
    });
    throw new Error(payload.error_description || payload.error || "Google token exchange failed");
  }

  return payload;
}

async function fetchGoogleUserInfo(accessToken: string) {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await res.json()) as GoogleUserInfo;

  if (!res.ok) {
    throw new Error("Failed to fetch Google user info");
  }

  return payload;
}

function isAuthorizedGoogleUser(profile: GoogleUserInfo) {
  return Boolean(
    profile.email &&
    profile.email_verified &&
    profile.hd === allowedGoogleDomain,
  );
}

function needsUploadAuth(pathname: string, method: string) {
  if (pathname === "/api/sign-upload" && method === "POST") {
    return true;
  }

  if (pathname.startsWith("/api/delete/") && method === "POST") {
    return true;
  }

  const namespaceRoute = routeNamespacePage(pathname);
  return Boolean(namespaceRoute?.upload);
}

function buildLoginRedirect(req: Request) {
  const url = new URL(req.url);
  const loginUrl = new URL("/auth/google/login", getRequestOrigin(req));
  loginUrl.searchParams.set("returnTo", `${url.pathname}${url.search}`);
  return loginUrl.pathname + loginUrl.search;
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
      const session = await requireSession(req);

      let response: Response;

      if (!session && needsUploadAuth(pathname, req.method)) {
        if (req.method === "GET") {
          response = redirect(buildLoginRedirect(req));
        } else {
          response = unauthorized();
        }

        return withCors(response, origin);
      }

      if (pathname === "/checkauth" && req.method === "GET") {
        response = json({ authenticated: Boolean(session) });
        return withCors(response, origin);
      }

      if (pathname === "/auth/google/login" && req.method === "GET") {
        if (!oauthClientId || !oauthClientSecret || !sessionSecret) {
          response = serverError("OAuth is not configured", 500);
          return withCors(response, origin);
        }

        const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
        const state = buildStateValue();
        const headers = new Headers();
        appendSetCookie(headers, createOauthStateCookie(state));
        response = redirect(buildGoogleLoginUrl(req, state, returnTo), { headers });
        return withCors(response, origin);
      }

      if (pathname === "/auth/google/callback" && req.method === "GET") {
        if (!oauthClientId || !oauthClientSecret || !sessionSecret) {
          response = serverError("OAuth is not configured", 500);
          return withCors(response, origin);
        }

        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const storedState = getCookie(req, oauthStateCookieName);

        if (!code || !returnedState || !storedState) {
          response = badRequest("Invalid OAuth callback", 400);
          return withCors(response, origin);
        }

        const [state, encodedReturnTo] = returnedState.split(":", 2);

        if (state !== storedState) {
          response = badRequest("OAuth state mismatch", 400);
          return withCors(response, origin);
        }

        const tokenPayload = await exchangeCodeForTokens(req, code);
        const profile = await fetchGoogleUserInfo(tokenPayload.access_token!);

        if (!isAuthorizedGoogleUser(profile)) {
          response = new Response("Forbidden", { status: 403 });
          return withCors(response, origin);
        }

        const sessionToken = await createSessionToken({
          email: profile.email!,
          name: profile.name || profile.email!,
          picture: profile.picture,
        });

        const headers = new Headers();
        appendSetCookie(headers, buildCookie(sessionCookieName, sessionToken, sessionTTL, "None"));
        appendSetCookie(headers, clearCookie(oauthStateCookieName, "Lax"));

        const returnTo = sanitizeReturnTo(
          encodedReturnTo ? base64UrlDecode(encodedReturnTo) : "/",
        );
        response = redirect(returnTo, { headers });
        return withCors(response, origin);
      }

      if (pathname === "/auth/logout" && req.method === "POST") {
        const headers = new Headers();
        appendSetCookie(headers, clearCookie(sessionCookieName, "None"));
        response = json({ success: true }, { headers });
        return withCors(response, origin);
      }

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
console.log("OAuth configuration", {
  allowedGoogleDomain,
  hasClientId: Boolean(oauthClientId),
  hasClientSecret: Boolean(oauthClientSecret),
  hasSessionSecret: Boolean(sessionSecret),
  configuredRedirectUri: Bun.env.OAUTH_REDIRECT_URI || null,
});
