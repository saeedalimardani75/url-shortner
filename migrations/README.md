# Database Migrations

This directory contains database schema migrations for the URL Shortener project.

---

## Manual SQL Migrations

### `api_key` Role Constraint

Adds a `CHECK` constraint to ensure the `role` column in `api_keys` only accepts valid values.

```sql
ALTER TABLE api_keys
  ADD CONSTRAINT chk_api_key_role
  CHECK (role IN ('admin', 'readonly', 'analytics'));
```

> **Note:** Run this directly against your PostgreSQL database. TypeORM does not natively support `CHECK` constraints via decorators, so this is applied as a raw SQL migration.

---

## Automated Migrations with TypeORM

If you prefer using TypeORM's migration system for future schema changes:

1. **Uncomment** the `migrations` and `migrationsTableName` options in `src/app.module.ts`:

   ```ts
   // TypeOrmModule.forRootAsync({
   //   ...
   //   migrations: ['dist/migrations/*.js'],
   //   migrationsTableName: 'typeorm_migrations',
   //   migrationsRun: true,
   // })
   ```

2. **Generate** a migration:

   ```sh
   npx typeorm migration:generate -n MigrationName
   ```

3. **Run** pending migrations:

   ```sh
   npx typeorm migration:run
   ```

---

## Adding a New Migration

1. Create a file in this directory following the naming convention: `YYYYMMDDHHMMSS-description.sql`
2. Add the `UP` (apply) and `DOWN` (rollback) SQL statements
3. Document the migration purpose and any manual steps required
