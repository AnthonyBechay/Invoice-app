# Deployment Guide

## Database Migrations

### Automatic Deployment (Render)

When you push to your repository, Render will automatically:

1. Install dependencies (`pnpm install`)
2. Generate Prisma client (`pnpm run build`)
3. **Run all pending migrations** (`pnpm run prisma:migrate`)
4. Start the server (`node src/server.js`)

The `render.yaml` file is configured to run migrations during the build phase, ensuring your database schema is always up to date before the app starts.

### Manual Migration (if needed)

If you need to manually run migrations on your Render service:

1. Go to your Render dashboard
2. Select your `invoice-app-backend` service
3. Go to the "Shell" tab
4. Run:
   ```bash
   cd packages/backend
   pnpm run prisma:migrate
   ```

### Local Development

To apply migrations locally:

```bash
cd packages/backend
pnpm run db:migrate
```

This will:
- Apply all pending migrations
- Generate Prisma client
- Prompt you to name new migrations (if schema changed)

### Current Migrations

1. **20250110000000_init** - Initial database schema
2. **20250110000001_expand_stock_fields** - Added detailed stock fields
3. **20250111000002_add_supplier_model** - Added Supplier table and supplier relationship to Stock

### Rollback (Emergency)

If a migration causes issues in production:

1. Access the Render Shell
2. Run:
   ```bash
   cd packages/backend
   npx prisma migrate resolve --rolled-back 20250111000002_add_supplier_model
   ```
3. Revert the code changes and redeploy

## Deployment Checklist

Before deploying major changes:

- [ ] Test migrations locally first
- [ ] Backup production database
- [ ] Review migration SQL files
- [ ] Check that `render.yaml` includes migration step
- [ ] Monitor deployment logs on Render
- [ ] Test the app after deployment

## Environment Variables

Required environment variables (automatically set by Render):

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `NODE_ENV` - Set to "production"
- `PORT` - Set to 10000
- `FRONTEND_URL` - Your Vercel frontend URL

## Troubleshooting

### Migration fails during deployment

**Symptom**: Build fails with Prisma migration error

**Solution**:
1. Check the Render logs for the specific error
2. Verify DATABASE_URL is set correctly
3. Check if migration SQL is compatible with PostgreSQL 17
4. Try running migration manually via Shell

### "Column does not exist" error after deployment

**Symptom**: App crashes with database column errors

**Solution**:
1. Migration didn't run - check build logs
2. Manually run `pnpm run prisma:migrate` in Shell
3. Verify migration files are committed to git

### Database connection issues

**Symptom**: Cannot connect to database

**Solution**:
1. Check DATABASE_URL environment variable
2. Verify IP allowlist includes 0.0.0.0/0
3. Check database status on Render dashboard
4. Restart the backend service

## Performance Optimization

After deploying migrations:

1. **Check indexes**: Ensure indexes were created (Supplier.userId, Supplier.name, Stock.supplierId)
2. **Monitor queries**: Use Prisma Studio or PG Admin to check query performance
3. **Add indexes** if needed for frequently queried columns

## Support

If you encounter issues during deployment:

1. Check Render build logs
2. Review this guide
3. Check Prisma documentation: https://www.prisma.io/docs/
4. Verify all migration files are in git
