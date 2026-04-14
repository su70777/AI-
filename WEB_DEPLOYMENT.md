# Web Deployment for `/web/`

If your public site is served from:

`https://lmf.hszk365.cn/web/`

use the following setup.

## 1. Frontend build path

The project already supports a configurable Vite base path.

Current production config:

```env
VITE_BASE_PATH=/web/
```

This makes built assets load correctly under the `/web/` subpath.

## 2. Backend redirect URL

Set the frontend URL to the exact public URL of the site:

```env
APP_FRONTEND_URL=https://lmf.hszk365.cn/web/
```

The backend OAuth callback will redirect back to this URL after login or authorization.

## 3. Deployment order

1. Build the frontend:

```bash
npm.cmd run build
```

2. Upload the contents of `dist/` to the server path that maps to `/web/`
3. Make sure `https://lmf.hszk365.cn/web/` opens your real homepage
4. Only then fill that URL into the Douyin app's `应用官网`

## 4. What is acceptable as the app website

Good:

- A public homepage with product introduction
- Functional pages that explain the platform
- A clean landing page with contact and policy links

Not good:

- Default hosting pages like "site deployed successfully"
- API-only responses like `{"detail":"Not Found"}`
- Local development URLs such as `127.0.0.1`

## 5. OAuth callback reminder

The Douyin callback path in this project is:

```text
/oauth/douyin/callback
```

When you deploy to your server, make sure the full callback URL configured in the Douyin console matches the actual backend address.
