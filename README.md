# DONASI.LIVE — FINAL DEPLOY

## Stack
Node.js 20+, Express, PostgreSQL (Railway), JWT, Google/YouTube OAuth, PaymenKu, SSE, OBS Browser Source.

## Deploy via terminal

### 1. GitHub
```bash
git init
git add .
git commit -m "Donasi.Live production"
git branch -M main
git remote add origin https://github.com/USERNAME/donasi-live.git
git push -u origin main
```

### 2. Railway CLI
Install/login according to Railway CLI instructions, then:
```bash
railway login
railway init
railway up
```

Create PostgreSQL:
```bash
railway add --database postgres
```

Then set variables in Railway dashboard or CLI. At minimum:
```bash
railway variables set JWT_SECRET="LONG_RANDOM_SECRET"
railway variables set APP_URL="https://YOUR-DOMAIN"
railway variables set DATABASE_URL="..."
railway variables set PAYMENKU_API_URL="https://api.paymenku.com"
railway variables set PAYMENKU_API_KEY="..."
railway variables set PAYMENKU_WEBHOOK_SECRET="..."
railway variables set PAYMENKU_CALLBACK_URL="https://YOUR-DOMAIN/api/payment/webhook"
railway variables set GOOGLE_CLIENT_ID="..."
railway variables set GOOGLE_CLIENT_SECRET="..."
railway variables set YOUTUBE_REDIRECT_URI="https://YOUR-DOMAIN/api/integrations/youtube/callback"
```

Railway normally exposes the PostgreSQL connection URL to the service. If your Railway project already injects `DATABASE_URL`, do not overwrite it manually.

### 3. GitHub auto deploy
Connect the GitHub repository to the Railway service. Future:
```bash
git add .
git commit -m "update"
git push
```
Railway redeploys automatically when GitHub integration is enabled.

## Google OAuth
Google Cloud Console → OAuth consent screen → create OAuth client (Web application).
Authorized redirect URI:
`https://YOUR-DOMAIN/api/integrations/youtube/callback`

The app requests read-only YouTube scope.

## PaymenKu
Set the callback URL:
`https://YOUR-DOMAIN/api/payment/webhook`

The backend verifies HMAC webhook signatures. Exact PaymenKu header/payload names should be matched to the merchant API documentation if your account uses a different webhook contract.

## OBS
Streamer dashboard displays:
`https://YOUR-DOMAIN/overlay/STREAMER_UUID`

OBS → Sources → Browser → URL above.

## Production hardening still recommended
- Store OAuth refresh tokens encrypted at rest.
- Use Redis for multi-instance SSE/pubsub.
- Add rate limiting/WAF.
- Add CSRF protection if switching to cookie auth.
- Add media URL allowlist, download/proxy service, MIME scanning and moderation.
- Add payout ledger and reconciliation.
- Add admin panel.
