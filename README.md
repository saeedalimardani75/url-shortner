

```

  _   _ ____  _      _____ ____  _   _ _____ _____ ____  
 | | | |  _ \| |    | ____/ ___|| | | |_   _| ____|  _ \ 
 | | | | |_) | |    |  _| \___ \| |_| | | | |  _| | |_) |
 | |_| |  _ <| |___ | |___ ___) |  _  | | | | |___|  _ < 
  \___/|_| \_\_____|_____|____/|_| |_| |_| |_____|_| \_\

```

# URL Shortener — Production-Grade Backend

A production-grade URL shortening service built with NestJS, PostgreSQL, Redis, and BullMQ — designed for scalability, observability, and maintainability. Inspired by the backend architecture of Bitly.

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Performance & Design Decisions](#performance--design-decisions)
- [Security Considerations](#security-considerations)
- [Scaling Considerations](#scaling-considerations)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Future Improvements](#future-improvements)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Client / Load Balancer                      │
└──────────────┬──────────────────────────────┬────────────────────────┘
               │                              │
         Public Traffic                  Admin Traffic
               │                              │
               ▼                              ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   NestJS HTTP Server     │  │   NestJS HTTP Server     │
│  POST /shorten           │  │  GET  /admin/links       │
│  GET  /:code (redirect)  │  │  POST /admin/api-keys    │
│  GET  /stats/:code       │  │  ...                     │
│                          │  │                          │
│  Rate Limiting (in-mem)  │  │  API Key Auth (Redis)    │
│  Request ID + Pino Log   │  │  Role-based Access       │
└──────────┬───────────────┘  └──────────┬───────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Application Layer                              │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Link    │  │  Auth    │  │Analytics │  │  Admin   │              │
│  │  Module  │  │  Module  │  │  Module  │  │  Module  │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │              │                   │
│       ▼              ▼              ▼              ▼                   │
│  ┌─────────────────────────────────────────────────────┐              │
│  │              Redis Caching Layer                     │              │
│  │  • Link Cache (TTL: 10min)                          │              │
│  │  • API Key Cache (TTL: 1h)                          │              │
│  │  • Analytics Cache (TTL: 5min)                      │              │
│  └─────────────────┬───────────────────────────────────┘              │
│                    │                                                   │
│                    ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐              │
│  │              BullMQ (Job Queue)                      │              │
│  │  • Analytics Queue → Async Click Recording           │              │
│  │  • Cleanup Queue → Scheduled Expired Link Deletion   │              │
│  └─────────────────┬───────────────────────────────────┘              │
└────────────────────┼──────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Data Layer                                    │
│                                                                       │
│  ┌─────────────────────┐  ┌─────────────────────┐                     │
│  │     PostgreSQL      │  │       Redis          │                     │
│  │  • links            │  │  • Cache             │                     │
│  │  • clicks           │  │  • BullMQ Backend    │                     │
│  │  • api_keys         │  │                     │                     │
│  └─────────────────────┘  └─────────────────────┘                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow — Redirect Request

```
Client                        NestJS                       Redis                   PostgreSQL                BullMQ
  │                             │                          │                        │                         │
  │  GET /abc123               │                          │                        │                         │
  │───────────────────────────▶│                          │                        │                         │
  │                            │  GET link:abc123          │                        │                         │
  │                            │─────────────────────────▶│                        │                         │
  │                            │                          │                        │                         │
  │                            │  ◀───────── Cache HIT ───│                        │                         │
  │                            │     (or DB miss → query) │                        │                         │
  │                            │                          │                        │                         │
  │                            │  Enqueue Click Event     │                        │                         │
  │                            │──────────────────────────────────────────────────────────────────────────▶│
  │                            │                          │                        │                         │
  │                            │  Increment click_count   │                        │                         │
  │                            │───────────────────────────────────────────────▶│                         │
  │                            │                          │                        │                         │
  │  ◀──── 301 Redirect ──────│                          │                        │                         │
  │                            │                          │                        │                         │
  │                            │                          │                        │    Async Click Recording │
  │                            │                          │                        │◀─────────────────────────│
  │                            │                          │                        │                         │
```

### Entity Relationship Diagram

```
┌───────────────┐       ┌──────────────────┐       ┌───────────────────┐
│     links     │       │     clicks       │       │     api_keys      │
├───────────────┤       ├──────────────────┤       ├───────────────────┤
│ id (PK)       │──┐    │ id (PK)          │       │ id (PK)           │
│ short_code    │  │    │ link_id (FK)     │──┐    │ key_hash (unique) │
│ original_url  │  └───▶│ ip               │  │    │ name (unique)     │
│ click_count   │       │ user_agent       │  │    │ role              │
│ is_active     │       │ referrer         │  │    │ is_active         │
│ expires_at    │       │ country          │  │    │ expires_at        │
│ deleted_at    │       │ browser          │  │    │ last_used_at      │
│ created_at    │       │ os               │  │    │ rotated_from_id   │
│ updated_at    │       │ clicked_at       │  │    │ created_at        │
└───────────────┘       └──────────────────┘  │    │ updated_at        │
                                               │    └───────────────────┘
                                               └───▶ (link_id FK)
```

---

## Features

### Core
- **URL Shortening** — Create short links with auto-generated or custom codes
- **Fast Redirects** — 301 redirects with Redis caching (sub-millisecond for cached links)
- **Automatic Expiration** — Links can have TTL; expired links are auto-deactivated by scheduled job
- **Soft Delete & Restore** — Admin can soft-delete and restore links

### Authentication & Authorization
- **API Key Authentication** — All admin endpoints protected by API key
- **Key Hashing** — Keys are hashed with SHA-256 before storage; plain key shown only once
- **Key Rotation** — Rotate keys without downtime
- **Expiration & Status** — Keys can expire and be activated/deactivated
- **Role-Based Access** — Four roles: `admin`, `customer`, `readonly`, `analytics`

### Analytics
- **Async Click Tracking** — Clicks are recorded asynchronously via BullMQ, not blocking redirects
- **Aggregated Statistics** — Daily, hourly, country, browser, OS, referrer breakdowns
- **Unique Visitor Count** — Distinct IP counting
- **Cached Analytics** — Results cached in Redis with 5-minute TTL

### Observability
- **Structured Logging** — JSON logging via Pino with request IDs
- **Health Endpoints** — `GET /health` checks PostgreSQL, Redis, and BullMQ
- **Prometheus Metrics** — `GET /metrics` exposes default Node.js metrics
- **Request ID Tracking** — Every request gets a unique ID via `x-request-id` header

### Caching
- **Link Cache** — Redirects use Redis cache with 10-minute TTL, invalidated on updates
- **API Key Cache** — Validated keys cached for 1 hour, invalidated on status changes
- **Analytics Cache** — Aggregated results cached for 5 minutes

### Reliability
- **Rate Limiting** — Per-IP rate limiting on public endpoints
- **Graceful Error Handling** — Consistent JSON error responses across all endpoints
- **Retry Logic** — BullMQ jobs retry with exponential backoff (max 3 attempts)
- **Database Indexes** — Key columns indexed for query performance

---

## Tech Stack

| Component          | Technology                                     |
|--------------------|------------------------------------------------|
| Framework          | NestJS 10 (Node.js 20)                        |
| Language           | TypeScript 5                                  |
| Database           | PostgreSQL 16                                 |
| ORM                | TypeORM 0.3                                   |
| Cache              | Redis 7 (via ioredis)                         |
| Queue              | BullMQ / @nestjs/bull                         |
| Validation         | Joi (env), class-validator (DTOs)             |
| Logging            | Pino (via nestjs-pino)                        |
| Security           | Helmet, SHA-256 hashing, Rate Limiting        |
| API Docs           | Swagger / OpenAPI                             |
| Metrics            | prom-client                                   |
| Testing            | Jest (127 tests, 16 suites)                   |
| CI/CD              | GitHub Actions (lint → test → build)          |
| Container          | Docker & Docker Compose (multi-stage build)   |

---

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for containerized setup)
- npm 10+

---

## Quick Start

### Clone and install

```bash
cd url-shortener
npm install
```

### Environment variables

Copy the example file:

```bash
cp .env.example .env
# Then edit .env with your values
```

See [Configuration](#configuration) for all variables.

### Run with Docker Compose (recommended)

```bash
docker compose up --build
```

This starts NestJS (port 3000), PostgreSQL (port 5432), and Redis (port 6379).

### Run locally (development)

```bash
# Start dependencies
docker compose up db redis -d

# Start app in watch mode
npm run start:dev
```

### First admin API key (auto-seeded)

On first startup with an empty database, the app **automatically creates a bootstrap admin API key** and prints it to the logs:

```
[Nest] WARN BootstrapSeeder - ═══════════════════════════════════════════════════════════
[Nest] WARN BootstrapSeeder -   No API keys found — created bootstrap admin key
[Nest] WARN BootstrapSeeder -   SAVE THIS KEY — it will NOT be shown again:
[Nest] WARN BootstrapSeeder -   sk_live_8f3a2b1c9d0e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f
[Nest] WARN BootstrapSeeder -   Use it in the x-api-key header for admin endpoints.
[Nest] WARN BootstrapSeeder -   You can create additional keys via POST /api/admin/api-keys
[Nest] WARN BootstrapSeeder - ═══════════════════════════════════════════════════════════
```

Copy this key — it is shown **only once**. Subsequent restarts will not regenerate it.

Use it to access all admin endpoints and create additional keys via the Swagger UI or curl:

```bash
curl -X POST http://localhost:3000/api/admin/api-keys \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: sk_live_8f3a2b1c9d0e...' \
  -d '{"name": "marketing-dashboard", "role": "analytics"}'
```

### Access the API

- **Swagger Docs**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/health
- **Metrics**: http://localhost:3000/metrics

---

## Configuration

All environment variables are validated with **Joi** at startup; invalid config fails fast.

| Variable                     | Default        | Description                          |
|------------------------------|----------------|--------------------------------------|
| `PORT`                       | `3000`         | HTTP server port                     |
| `NODE_ENV`                   | `development`  | Environment (`development`, `production`, `test`) |
| `LOG_LEVEL`                  | `info`         | Pino log level (`trace`-`fatal`)     |
| `BASE_URL`                   | `http://localhost:3000` | Public base URL for short links |
| `REDIRECT_STATUS`            | `301`          | HTTP redirect status (`301`, `302`, `307`, `308`) |
| `DB_HOST`                    | `localhost`    | PostgreSQL host                      |
| `DB_PORT`                    | `5432`         | PostgreSQL port                      |
| `DB_USERNAME`                | `postgres`     | PostgreSQL username                  |
| `DB_PASSWORD`                | (required)     | PostgreSQL password                  |
| `DB_NAME`                    | `urlshortener` | PostgreSQL database name             |
| `REDIS_HOST`                 | `localhost`    | Redis host                           |
| `REDIS_PORT`                 | `6379`         | Redis port                           |
| `REDIS_PASSWORD`             | (empty)        | Redis password (min 8 chars in production) |
| `REDIS_DB`                   | `0`            | Redis database index                 |
| `API_KEY_PREFIX`             | `sk_live_`     | Prefix for generated API keys        |
| `CORS_ORIGIN`                | `*`            | Allowed CORS origins (comma-separated) |
| `GRACEFUL_SHUTDOWN_TIMEOUT`  | `25000`        | Max shutdown wait time (ms)          |
| `RATE_LIMIT_TTL`             | `60`           | Rate limit window (seconds)          |
| `RATE_LIMIT_MAX`             | `10`           | Max requests per window              |

---

## API Reference

### Public Endpoints

#### `POST /api/shorten` — Create a short URL

```bash
curl -X POST http://localhost:3000/api/shorten \
  -H 'Content-Type: application/json' \
  -d '{"originalUrl": "https://example.com/very/long/url"}'
```

Response:
```json
{
  "id": 1,
  "shortCode": "aB3xK9mQ",
  "originalUrl": "https://example.com/very/long/url",
  "shortUrl": "http://localhost:3000/aB3xK9mQ",
  "clickCount": 0,
  "isActive": true,
  "createdAt": "2026-06-27T12:00:00.000Z"
}
```

With custom code and expiration:
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H 'Content-Type: application/json' \
  -d '{
    "originalUrl": "https://example.com",
    "customCode": "my-link",
    "expiresAt": "2027-12-31T23:59:59.000Z"
  }'
```

#### `GET /:code` — Redirect to original URL

```bash
curl -v http://localhost:3000/abc123
# 301 Redirect to https://example.com
```

#### `GET /api/stats/:code` — Get click statistics

```bash
curl http://localhost:3000/api/stats/abc123
```

Response:
```json
{
  "shortCode": "abc123",
  "originalUrl": "https://example.com",
  "totalClicks": 42,
  "clicksByDate": [
    { "date": "2026-06-27", "count": "10" },
    { "date": "2026-06-26", "count": "32" }
  ]
}
```

### Admin Endpoints (require `x-api-key` header)

> **Roles:** Link endpoints (`GET/POST/DELETE/PUT /api/admin/links*`) accept `admin` or `customer`.  
> **Roles:** API key endpoints (`*/api/admin/api-keys*`) accept **`admin` only**.

#### `GET /api/admin/links` — List all links (paginated)

```bash
curl http://localhost:3000/api/admin/links?page=1&limit=20 \
  -H 'x-api-key: sk_live_...'
```

#### `POST /api/admin/links` — Create a link (admin)

```bash
curl -X POST http://localhost:3000/api/admin/links \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: sk_live_...' \
  -d '{"originalUrl": "https://example.com"}'
```

#### `DELETE /api/admin/links/:id` — Soft delete a link

```bash
curl -X DELETE http://localhost:3000/api/admin/links/1 \
  -H 'x-api-key: sk_live_...'
```

#### `PUT /api/admin/links/:id/restore` — Restore a link

```bash
curl -X PUT http://localhost:3000/api/admin/links/1/restore \
  -H 'x-api-key: sk_live_...'
```

#### `PUT /api/admin/links/:id/toggle?active=false` — Enable/disable a link

```bash
curl -X PUT "http://localhost:3000/api/admin/links/1/toggle?active=false" \
  -H 'x-api-key: sk_live_...'
```

### API Key Management

#### `POST /api/admin/api-keys` — Create API key

```bash
curl -X POST http://localhost:3000/api/admin/api-keys \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: sk_live_...' \
  -d '{"name": "my-app", "role": "admin"}'
```

Response (plain key shown **only once**):
```json
{
  "plainKey": "sk_live_abc123def456...",
  "apiKey": {
    "id": 1,
    "name": "my-app",
    "role": "admin",
    "isActive": true,
    "createdAt": "2026-06-27T12:00:00.000Z"
  }
}
```

#### `PUT /api/admin/api-keys/:id/rotate` — Rotate key

```bash
curl -X PUT http://localhost:3000/api/admin/api-keys/1/rotate \
  -H 'x-api-key: sk_live_...'
```

#### `PUT /api/admin/api-keys/:id/status?active=false` — Activate/deactivate

```bash
curl -X PUT "http://localhost:3000/api/admin/api-keys/1/status?active=false" \
  -H 'x-api-key: sk_live_...'
```

### Analytics Endpoints

#### `GET /api/analytics/:linkId` — Aggregated analytics

```bash
curl "http://localhost:3000/api/analytics/1?startDate=2026-01-01&endDate=2026-12-31" \
  -H 'x-api-key: sk_live_...'
```

Response:
```json
{
  "totalClicks": 1000,
  "uniqueVisitors": 500,
  "clicksByDate": [
    { "date": "2026-06-27", "count": 42 }
  ],
  "clicksByHour": [
    { "hour": 14, "count": 12 }
  ],
  "topCountries": [
    { "country": "US", "count": 150 }
  ],
  "topBrowsers": [
    { "browser": "Chrome", "count": 200 }
  ],
  "topOs": [
    { "os": "Windows", "count": 180 }
  ],
  "topReferrers": [
    { "referrer": "https://twitter.com", "count": 50 }
  ]
}
```

### Health & Monitoring

#### `GET /health`

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "healthy",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "uptime": 12345,
  "checks": {
    "database": { "status": "up", "latency": "2ms" },
    "redis": { "status": "up", "latency": "1ms" },
    "bullmq": { "status": "up", "latency": "1ms" }
  }
}
```

#### `GET /metrics`

```bash
curl http://localhost:3000/metrics
# Prometheus-formatted metrics
```

---

## Performance & Design Decisions

### Why Redis caching for redirects?
Redirects are the hottest path. With Redis, a cached redirect resolves in <1ms vs. 5-15ms for a database query. Cache is invalidated on any link modification (status change, deletion, update).

### Why async click processing (BullMQ)?
Recording a click involves parsing user-agent, geo-IP lookup, and a database write. Doing this synchronously would add 20-50ms to every redirect. By enqueuing the event and returning the redirect immediately, we keep redirect latency minimal. BullMQ provides persistence — if the worker crashes, no clicks are lost.

### Why SHA-256 for API keys?
Storing plain-text API keys is a security risk. SHA-256 hashing ensures that even if the database is compromised, keys cannot be recovered. The plain key is shown only once at creation time.

### Why Redis-backed rate limiting with in-memory fallback?
Rate limiting uses Redis for distributed counting, which works across multiple instances. If Redis is unavailable, it falls back to an in-memory Map with periodic eviction to prevent memory leaks — ensuring the service remains available even during a cache outage.

### Why soft delete instead of hard delete?
Soft delete allows recovery and maintains referential integrity with analytics data. Hard delete is available as an explicit admin action.

### Why Pino over NestJS default logger?
Pino is significantly faster (2-3x) and produces structured JSON output that integrates with log aggregation systems (ELK, Datadog, etc.). Each log line includes a `requestId` for distributed tracing.

---

## Security Considerations

- **Helmet middleware** — HTTP security headers (CSP, HSTS, X-Frame-Options, etc.) applied globally.
- **API keys are SHA-256 hashed** before storage. The plain key is returned only at creation.
- **Rate limiting** protects public endpoints from abuse, with Redis-backed implementation and automatic in-memory fallback.
- **Input validation** — All DTOs use `class-validator` with whitelist mode; unknown properties are rejected.
- **Environment validation** — Joi validates all env vars at startup; misconfiguration fails fast.
- **Request IDs** enable tracing across logs for security auditing.
- **Role-based access** — Four roles limit what API keys can do:

  | Role | Manage links | View analytics | Create/manage API keys |
  |------|:-----------:|:-------------:|:--------------------:|
  | `admin` | ✅ | ✅ | ✅ |
  | `customer` | ✅ | ✅ | ❌ |
  | `analytics` | ❌ | ✅ | ❌ |
  | `readonly` | ❌ | ❌ | ❌ |
- **Key rotation** — Compromised keys can be rotated without creating new ones.
- **CORS** is enabled but should be restricted to known origins in production.

### Production Checklist

- [x] `NODE_ENV=production` disables TypeORM `synchronize` and Pino pretty-print
- [x] Helmet security headers enabled
- [x] Global validation pipe with whitelist + forbidNonWhitelisted
- [x] Structured JSON logging via Pino with request IDs
- [x] Graceful shutdown with configurable timeout
- [x] Docker health checks for all services
- [x] Composite indexes for analytics query performance
- [x] Bootstrap seeder creates first admin API key on empty database
- [ ] Use strong `DB_PASSWORD` and `REDIS_PASSWORD` in production
- [ ] Restrict CORS origins to known domains
- [ ] Configure HTTPS termination (reverse proxy / load balancer)
- [ ] Set up log aggregation (ELK, Datadog, etc.)
- [ ] Replace in-memory rate limiting fallback with Redis-backed
- [ ] Add geo-IP resolution for click analytics
- [ ] Run database migrations explicitly (not sync)

---

## Scaling Considerations

- **Horizontal Scaling** — The NestJS app is stateless and can scale horizontally behind a load balancer.
- **Redis** — All instances share the same Redis for cache and BullMQ. Consider Redis Sentinel/Cluster for HA.
- **Database** — Add read replicas for analytics queries. Partition the `clicks` table by date for large-scale deployments.
- **BullMQ Workers** — Analytics and cleanup workers can be scaled independently. Add more workers to `analytics` queue for higher throughput.
- **CDN** — Redirects could be served from a CDN edge with the link data cached at the edge.
- **Rate Limiting** — For multi-instance deployments, switch to a centralized Redis-backed rate limiter.
- **Connection Pooling** — TypeORM pools database connections. Adjust pool size based on instance count.

---

## Testing

```bash
# Unit + integration tests
npm test

# With coverage
npm run test:cov

# End-to-end tests (requires database)
npm run test:e2e
```

The test suite covers **127 tests** across **16 test suites**:

| Module               | Tests | Key Coverage                                      |
|----------------------|-------|---------------------------------------------------|
| LinkService          | 15    | CRUD, caching, soft delete, restore, pagination   |
| LinkController       | 3     | Create, redirect, stats endpoints                 |
| AuthService          | 12    | Creation, validation, hashing, rotation, caching  |
| ApiKeyGuard          | 5     | Auth header extraction, validation                |
| RolesGuard           | 4     | Role checking, missing key, insufficient role     |
| AnalyticsService     | 4     | Aggregation, caching, grouped queries             |
| AnalyticsController  | 2     | Aggregated analytics endpoint                     |
| AdminController      | 11    | All admin CRUD endpoints                          |
| HealthController     | 2     | Health check logic                                |
| ExceptionFilter      | 3     | Error format consistency                          |
| ThrottleGuard        | 4     | Rate limiting, Redis fallback                     |
| RequestIdInterceptor | 2     | Request ID generation and propagation             |
| QueuesService        | 4     | Job scheduling, ping                              |
| RedisService         | 15    | get/set/del, delPattern, locks, getOrSet, ping    |
| AnalyticsProcessor   | 3     | Click recording, string truncation                |
| CleanupProcessor     | 3     | Expired link deactivation, error handling         |

---

## Project Structure

```
url-shortener/
├── .github/workflows/ci.yml     # GitHub Actions CI
├── src/
│   ├── main.ts                   # Entry point
│   ├── app.module.ts             # Root module
│   ├── config/
│   │   ├── configuration.ts      # Config factory
│   │   └── joi.config.ts         # Env validation schema
│   ├── common/
│   │   ├── filters/              # Exception filters
│   │   ├── guards/               # Throttle guard
│   │   ├── interceptors/         # Request ID + logging
│   │   ├── decorators/           # Rate limit decorator
│   │   └── seeders/              # Bootstrap seeders
│   ├── redis/                    # Redis module (global)
│   ├── queues/                   # BullMQ queues + processors
│   ├── health/                   # Health check endpoint
│   ├── link/                     # Link module (feature)
│   ├── auth/                     # Auth module (feature)
│   ├── analytics/                # Analytics module (feature)
│   └── admin/                    # Admin module (aggregator)
├── test/                         # E2E tests
├── docker-compose.yml
├── Dockerfile
└── package.json
```

### Feature-based Architecture

Each feature module follows a consistent structure:

```
feature/
├── dto/              # Data Transfer Objects
├── entities/         # TypeORM entities
├── guards/           # Route guards
├── decorators/       # Custom decorators
├── __tests__/        # Unit tests
├── feature.controller.ts
├── feature.service.ts
└── feature.module.ts
```

---

## Future Improvements

- **User Accounts** — Add user registration and authentication (OAuth2, JWT)
- **Custom Domains** — Support custom domains for short URLs
- **Geo-IP Resolution** — Add geo-location to click analytics using GeoIP databases
- **Link Groups** — Organize links into folders/projects
- **Bulk Operations** — CSV/API bulk creation and management
- **Webhooks** — Notify external services on link clicks
- **A/B Testing** — Rotate multiple destination URLs for a single short code
- **QR Code Generation** — Auto-generate QR codes for short links
- **Link Monitoring** — Check if destination URLs are still reachable
- **Export Analytics** — CSV/JSON export of analytics data
- **Team Management** — Multi-user with team-based access control
- **Audit Log** — Track all admin actions for compliance
- **gRPC API** — High-performance internal API for inter-service communication
- **Serverless** — Adapt for serverless deployment (AWS Lambda, etc.)
```
