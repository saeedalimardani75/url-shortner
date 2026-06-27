# Database Migrations

## Manual SQL Migration

### Add CHECK constraint for api_key role column

```sql
ALTER TABLE api_keys ADD CONSTRAINT chk_api_key_role CHECK (role IN ('admin', 'readonly', 'analytics'));
```

### To enable TypeORM migrations:

1. Uncomment the `migrations` and `migrationsTableName` in `src/app.module.ts` TypeORM config
2. Run `npx typeorm migration:generate -n MigrationName`
3. Run `npx typeorm migration:run`
