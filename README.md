# URL Shortener

A production-ready URL shortener service built with **NestJS**, **TypeScript**, **PostgreSQL**, and **TypeORM**.

## Features

- **Shorten URLs** — Create short, memorable links from long URLs
- **Custom slugs** — Optionally provide your own short code
- **Expiration** — Set an expiry date for time-limited links
- **Redirect** — 301 permanent redirect with click tracking
- **Analytics** — Track clicks, dates, referrers, and user agents per link
- **API Key Auth** — Protect management endpoints with API keys
- **Rate Limiting** — Configurable per-endpoint rate limits
- **Swagger Docs** — Interactive API documentation at `/docs`
- **Docker Support** — Run with a single `docker compose up` command

## Project Structure

```
src/
├── main.ts                 # Entry point, Swagger setup, global prefix
├── app.module.ts           # Root module with DB and config
├── config/
│   └── configuration.ts    # Environment variable loader
├── common/
│   ├── decorators/
│   │   └── rate-limit.decorator.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   └── guards/
│       └── throttle.guard.ts
├── link/
│   ├── link.module.ts
│   ├── link.controller.ts   # POST /shorten, GET /:code, GET|DELETE /links/...
│   ├── link.service.ts      # Business logic + reserved-code validation
│   ├── entities/
│   │   └── link.entity.ts
│   └── dto/
│       ├── create-link.dto.ts
│       └── link-response.dto.ts
├── analytics/
│   ├── analytics.module.ts
│   ├── analytics.service.ts  # Click recording + stats queries
│   └── entities/
│       └── click.entity.ts
└── auth/
    ├── auth.module.ts
    ├── auth.controller.ts    # CRUD for API keys
    ├── auth.service.ts
    ├── entities/
    │   └── api-key.entity.ts
    ├── guards/
    │   └── api-key.guard.ts
    └── dto/
        ├── create-api-key.dto.ts
        └── api-key-response.dto.ts
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or Docker)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env` and adjust values:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=urlshortener

RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=10
```

### 3. Start the database

```bash
# Using Docker
docker run -d \
  --name urlshortener-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=urlshortener \
  -p 5432:5432 \
  postgres:16-alpine
```

### 4. Run the app

```bash
# Development (watch mode)
npm run start:dev

# Production build
npm run build && npm run start:prod
```

The server starts at `http://localhost:3000`. Swagger docs at `http://localhost:3000/docs`.

## Docker Compose (recommended)

```bash
docker compose up --build
```

This starts both the app and PostgreSQL. The API is available at `http://localhost:3000`.

## API Reference

All management endpoints are prefixed with `/api`. The redirect endpoint is at the root.

### Create a short link

```http
POST /api/shorten
Content-Type: application/json

{
  "originalUrl": "https://example.com/very/long/url",
  "customCode": "my-link",
  "expiresAt": "2025-12-31T23:59:59.000Z"
}
```

**Response:** `201 Created`

```json
{
  "id": 1,
  "shortCode": "my-link",
  "originalUrl": "https://example.com/very/long/url",
  "shortUrl": "http://localhost:3000/my-link",
  "clickCount": 0,
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Redirect

```http
GET /my-link
```

Returns a **301 redirect** to the original URL.

### Get link statistics

```http
GET /api/stats/my-link
```

**Response:**

```json
{
  "shortCode": "my-link",
  "originalUrl": "https://example.com/very/long/url",
  "totalClicks": 42,
  "clicksByDate": [
    { "date": "2024-01-15", "count": "10" },
    { "date": "2024-01-14", "count": "32" }
  ]
}
```

### List all links

```http
GET /api/links
```

### Delete a link

```http
DELETE /api/links/1
```

### Manage API keys

```http
POST /api/auth/api-keys
Content-Type: application/json

{ "name": "My App", "role": "user" }
```

```http
GET /api/auth/api-keys
DELETE /api/auth/api-keys/1
```

## Rate Limiting

The `POST /api/shorten` endpoint is rate-limited to **10 requests per 60 seconds** per IP. Configure via `RATE_LIMIT_TTL` and `RATE_LIMIT_MAX` environment variables.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | App port |
| `NODE_ENV` | `development` | Environment mode |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USERNAME` | `postgres` | DB user |
| `DB_PASSWORD` | `postgres` | DB password |
| `DB_NAME` | `urlshortener` | Database name |
| `RATE_LIMIT_TTL` | `60` | Rate limit window (seconds) |
| `RATE_LIMIT_MAX` | `10` | Max requests per window |

## Database

TypeORM runs in `synchronize: true` for development (auto-creates tables). For production, set `NODE_ENV=production` and use migrations.

To generate a migration:

```bash
npx typeorm migration:create src/migrations/Init
```

## Scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Watch mode development |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run compiled output |
| `npm test` | Unit tests |
| `npm run lint` | Lint source files |

## License

MIT
