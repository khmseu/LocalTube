# LocalTube

LocalTube is a local-only video catalog and playback app.

- Backend: Fastify + SQLite + TypeScript
- Frontend: React + Vite + TypeScript
- Security posture: loopback-only server binding plus request hardening for host and origin checks

## Requirements

- Node.js 20+
- npm 10+
- `LOCALTUBE_VIDEO_ROOT` must point to your local video directory

Optional for media enrichment:

- `ffprobe` for metadata extraction
- `ffmpeg` for thumbnail generation

## Setup

```bash
npm install
```

Set required backend config:

```bash
export LOCALTUBE_VIDEO_ROOT="/absolute/path/to/your/videos"
```

Optional config:

```bash
export LOCALTUBE_SQLITE_PATH="/absolute/path/to/localtube.db"
export LOCALTUBE_THUMBNAIL_CACHE_DIR="/absolute/path/to/.localtube-thumbnails"
```

## Development

Run both workspace dev scripts:

```bash
npm run dev
```

Default app URLs:

- Backend: http://127.0.0.1:3000
- Frontend: http://127.0.0.1:5173

## Production Build And Local Run

Build all workspaces:

```bash
npm run build
```

Run full production preview (backend + frontend):

```bash
npm run start
```

This prints the URLs at startup. Open your browser at **http://127.0.0.1:4173**.

Run only backend production server:

```bash
npm run start:backend
```

Run only frontend production preview:

```bash
npm run start:frontend
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
