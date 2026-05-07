# Deployment

## DigitalOcean App Platform

This repository should be deployed as a **Web Service**, not a static site.

### Recommended Setup

- Source: GitHub repository `bremonline/Titan`
- Branch: `main`
- Type: Web Service
- Source directory: `/`
- Dockerfile path: `Dockerfile`
- HTTP port: `3000`
- Auto deploy: enabled for `main`

### Health Check

Use:

```text
/health
```

A healthy deployment returns JSON similar to:

```json
{"status":"ok","timestamp":1234567890}
```

### Why Dockerfile Deployment

The app serves:

- backend routes from `server/`
- frontend HTML from the repository root

The Dockerfile packages both into a single runtime image so the deployed app can serve:

- `/`
- `/health`
- `/api/*`
- `/socket.io/*`
- `/api/socket.io-client.js`

### Symptoms of Wrong App Platform Configuration

If DigitalOcean is configured as a static site or points at the wrong source directory, you will see:

- `/` loads HTML but the sidebar never connects
- `/health` returns `404`
- `/api/games` returns `404`
- `/socket.io/` returns `404`

If that happens, recreate or update the app as a Web Service using the settings above.
