# Deployment Checklist

## Prisma Setup

✅ **Prisma will run automatically on deployment:**
- `postinstall` script runs `prisma generate` after `pnpm install`
- `build` script runs `prisma generate`
- `render.yaml` buildCommand includes `prisma migrate deploy`

## Backend (Render)

1. **Environment Variables** (set in Render dashboard):
   - `DATABASE_URL` - Auto-configured from database
   - `JWT_SECRET` - Auto-generated
   - `NODE_ENV` - Set to `production`
   - `PORT` - Set to `10000`
   - `FRONTEND_URL` - Your Vercel frontend URL

2. **Build Process**:
   - Installs dependencies with `pnpm install`
   - Generates Prisma client with `prisma generate`
   - Runs migrations with `prisma migrate deploy`
   - Starts server with `pnpm start`

## Frontend (Vercel)

1. **Root Directory**: Set to `packages/frontend` in Vercel settings

2. **Environment Variables**:
   - `REACT_APP_API_URL` - Your Render backend URL (e.g., `https://your-backend.onrender.com/api`)

3. **Build Process**:
   - Runs `pnpm build` from `packages/frontend`
   - Outputs to `build/` directory

## First Deployment

If this is the first deployment, you may need to:

1. **Create initial migration** (run locally first):
   ```bash
   cd packages/backend
   pnpm run db:migrate --name init
   ```

2. **Or use db push** (for development):
   ```bash
   cd packages/backend
   pnpm run db:push
   ```

3. **Commit and push** the migration files to trigger deployment

## Notes

- Prisma migrations will run automatically on each deployment
- If no migrations exist, the build will continue (migration step is non-blocking)
- The `postinstall` hook ensures Prisma client is always generated

