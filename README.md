# LocalTube

LocalTube is a local-only video catalog and playback app.

- Backend: Fastify + SQLite + TypeScript
- Frontend: React + Vite + TypeScript
- Security posture: loopback-only server binding plus request hardening for host and origin checks

## Requirements

- Node.js 20+
- npm 10+

Optional for media enrichment:

- `ffprobe` for metadata extraction
- `ffmpeg` for thumbnail generation

## Setup

```bash
npm install
```

Create backend environment file from template:

```bash
cp apps/backend/.env.example apps/backend/.env
```

Backend environment variables are loaded from `apps/backend/.env`.

Default template values:

- `LOCALTUBE_VIDEO_ROOT`: `./videos`
- `LOCALTUBE_SQLITE_PATH`: `./localtube.db`
- `LOCALTUBE_THUMBNAIL_CACHE_DIR`: `./.localtube-thumbnails`
- `LOCALTUBE_FRONTEND_DIST_DIR`: `../frontend/dist`

If optional variables are unset, runtime defaults are:

- `LOCALTUBE_SQLITE_PATH`: `<current working directory>/localtube.db`
- `LOCALTUBE_THUMBNAIL_CACHE_DIR`: `<current working directory>/.localtube-thumbnails`
- `LOCALTUBE_FRONTEND_DIST_DIR`: `<current working directory>/../frontend/dist` (resolved from backend process working directory)

## Development

Run backend dev server:

```bash
npm run dev:backend
```

Run frontend dev server (separate terminal):

```bash
npm run dev:frontend
```

Run frontend preview server (development convenience, serves built frontend):

```bash
npm --workspace @localtube/frontend run preview
```

Default app URLs:

- Backend: <http://127.0.0.1:3000>
- Frontend dev server: <http://127.0.0.1:4173>

If only the backend is running, the app is still available at <http://127.0.0.1:3000> (served by backend).

## Production Build And Local Run

Build all workspaces:

```bash
npm run build
```

Run production mode (backend serves frontend build):

```bash
npm run start
```

The backend serves the built frontend assets in production mode.
Open your browser at **<http://127.0.0.1:3000>**.
Use Ctrl+C to stop the service.

Run only backend production server:

```bash
npm run start:backend
```

Run only frontend production preview:

```bash
npm --workspace @localtube/frontend run preview
```

## Tests

Run all tests:

```bash
npm test
```

## Local-Only Hardening

The backend enforces:

- Loopback remote address only (`127.0.0.1`, `::1`)
- Allowed `Host` headers only (`localhost`, `127.0.0.1`, `::1`)
- Allowed `Origin` only for mutating endpoints (`POST`, `PUT`, `PATCH`, `DELETE`)

Requests that fail these checks are rejected with `403`.
