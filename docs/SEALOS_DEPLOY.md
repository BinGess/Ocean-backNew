# Sealos Deployment Guide

This guide deploys Ocean Backend to Sealos with a container image and a Sealos PostgreSQL database.

## What You Will Deploy

- App image: `ghcr.io/<OWNER>/<REPO>:latest`
- Container port: `3000`
- Health check: `/health`
- Database: Sealos PostgreSQL
- Runtime command for the first single-instance release:

```bash
npm run prisma:deploy && npm run start:prod
```

`prisma migrate deploy` is idempotent and safe to run when the app starts as long as the app is running as one instance. If you later scale to multiple replicas, run migrations as a separate one-off task before redeploying all replicas.

## 1. Choose A Sealos Region

For a China mainland production deployment, choose the region based on your ICP filing provider:

- Beijing availability zone: file ICP with Volcengine.
- Hangzhou availability zone: file ICP with Alibaba Cloud.
- Guangzhou availability zone: file ICP with Tencent Cloud.

The ICP filing provider must match the underlying cloud provider of the Sealos availability zone. For a quick internal test without a custom domain, you can use the generated Sealos public URL first.

## 2. Push Code To GitHub

Create a GitHub repository and push this project to the `main` branch.

The workflow at `.github/workflows/publish-image.yml` publishes a Docker image to GitHub Container Registry:

```text
ghcr.io/<OWNER>/<REPO>:latest
ghcr.io/<OWNER>/<REPO>:<COMMIT_SHA>
```

After the first workflow run, open the package page in GitHub and make the image public, or configure Sealos with image pull credentials if you keep it private.

## 3. Create PostgreSQL In Sealos

Open Sealos Console, then open the Database app.

Recommended MVP settings:

- Type: `Postgres`
- Database name: `ocean`
- Replicas: `1`
- CPU: `0.25` to `0.5`
- Memory: `512 MiB` to `1 GiB`
- Storage: at least `5 GiB`

After deployment, copy the internal PostgreSQL connection string. It should look like:

```text
postgresql://<USER>:<PASSWORD>@<HOST>:5432/<DATABASE>
```

Append `?schema=public` if Sealos does not include it:

```text
postgresql://<USER>:<PASSWORD>@<HOST>:5432/<DATABASE>?schema=public
```

## 4. Create The Ocean Backend App

Open App Launchpad / App Deploy and create a new app.

Use these values:

- App name: `ocean-back-new`
- Image: `ghcr.io/<OWNER>/<REPO>:latest`
- Deploy mode: fixed instances
- Instance count: `1`
- CPU: `0.25` to `0.5`
- Memory: `512 MiB` to `1 GiB`
- Container port: `3000`
- Public access: enabled
- Health check path: `/health`

Startup command:

```bash
npm run prisma:deploy && npm run start:prod
```

If the UI has separate command and args fields, use:

```text
Command: sh
Args: -c "npm run prisma:deploy && npm run start:prod"
```

## 5. Add Environment Variables

Paste the values from `sealos.env.example`, replacing placeholders:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://<USER>:<PASSWORD>@<HOST>:5432/<DATABASE>?schema=public
JWT_ACCESS_SECRET=<generate-a-long-random-secret>
JWT_REFRESH_SECRET=<generate-another-long-random-secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN_DAYS=30
```

Generate JWT secrets locally:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Do not reuse the same value for access and refresh token secrets.

## 6. Deploy And Verify

Deploy the app and wait until the instance is running.

Open:

```text
https://<SEALOS_PUBLIC_URL>/health
https://<SEALOS_PUBLIC_URL>/docs
```

Expected `/health` response:

```json
{
  "status": "ok",
  "service": "ocean-back-new"
}
```

Then verify auth and sync with Swagger:

1. `POST /auth/register`
2. `POST /auth/login`
3. `GET /sync/snapshot` with Bearer token

## 7. Attach A Custom Domain

For China mainland custom domains, complete ICP filing first and make sure the filing provider matches the Sealos availability zone.

Then:

1. Keep public access enabled in Sealos.
2. Add a CNAME record from your domain to the Sealos-generated public domain.
3. Bind the custom domain in the app details page.
4. Verify `https://api.your-domain.com/health`.

## 8. Update And Roll Back

For normal updates:

1. Merge code to `main`.
2. Wait for GitHub Actions to publish a new image.
3. Redeploy the Sealos app with `ghcr.io/<OWNER>/<REPO>:latest`.
4. Verify `/health` and `/docs`.

For rollback, use a previous immutable SHA tag:

```text
ghcr.io/<OWNER>/<REPO>:<PREVIOUS_COMMIT_SHA>
```

## Production Notes

- Keep the first release at one replica while migrations run in the startup command.
- Turn on Sealos database backup if available in your chosen region.
- Keep Swagger `/docs` private or disabled before broad public launch if the API should not be exposed.
- Rotate JWT secrets if they are ever pasted into chat, logs, screenshots, or issue trackers.
- Do not sync audio files, App Lock passwords, biometric status, or AI provider keys into this backend.
