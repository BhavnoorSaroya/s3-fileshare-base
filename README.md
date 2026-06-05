# S3 file sharing base 

Meant for internal company use to quickly share files via user defined namespaces in an S3 bucket. Can be adapted for public use as well by adding an auth layer and assigning UUIDs for each namespace. 

The frontend is untested.  

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Auth Configuration

Upload routes use Google OAuth with a signed session cookie.

Required environment variables:

```bash
OAUTH_CLIENT_ID=...
OAUTH_CLIENT_SECRET=...
AUTH_SESSION_SECRET=replace-with-a-long-random-secret
ALLOWED_GOOGLE_DOMAIN=bytecamp.ca
# Optional if auto-derived callback URL is not correct for deployment
# OAUTH_REDIRECT_URI=https://your-host/auth/google/callback
```
