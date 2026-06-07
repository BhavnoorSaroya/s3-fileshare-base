# S3 file sharing base 

Meant for internal company use to quickly share files via user defined namespaces in an S3 bucket. Can be adapted for public use as well by condfiguring OIDC and assigning UUIDs for each namespace. 

The frontend is minimal

To install dependencies:

```bash
bun install
```

To run:

```bash
bun index.ts
```

## Auth 

Upload routes use Google OAuth with a signed session cookie.

Required environment variables:

```bash
OAUTH_CLIENT_ID=...
OAUTH_CLIENT_SECRET=...
AUTH_SESSION_SECRET=replace-with-a-long-random-secret
ALLOWED_GOOGLE_DOMAIN=
OAUTH_REDIRECT_URI=https://your-host/auth/google/callback
```

For deployed environments, the Google OAuth client should include the exact production callback URL in its authorized redirect URIs:

```bash
OAUTH_REDIRECT_URI=https://domain.ca/auth/google/callback
```

Common cause of `Error 401: invalid_client` on deploy:
- The deployed app is using a different `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, or `OAUTH_REDIRECT_URI` than the Google OAuth client expects.
- The production callback URL is missing from the Google Cloud Console OAuth client configuration.
- The deployed origin does not match the origin registered in Google.
