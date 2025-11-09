# Invoice App - Backend

Node.js Express backend for the Invoice App, providing REST API endpoints for all business logic.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: Firebase Firestore (via Admin SDK)
- **Auth**: Firebase Admin SDK for token verification
- **Security**: Helmet, CORS, Rate Limiting

## API Routes

All routes require authentication via Firebase token in `Authorization: Bearer <token>` header.

### Core Endpoints

- **Auth**: `/api/auth/*`
- **Clients**: `/api/clients/*`
- **Stock**: `/api/stock/*`
- **Documents**: `/api/documents/*` (Proformas & Invoices)
- **Payments**: `/api/payments/*`
- **Expenses**: `/api/expenses/*`
- **Settings**: `/api/settings/*`

See [MIGRATION_GUIDE.md](../../MIGRATION_GUIDE.md) for complete API documentation.

## Environment Variables

Create a `.env` file:

```env
PORT=5000
NODE_ENV=development
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
FRONTEND_URL=http://localhost:3000
```

## Development

```bash
pnpm dev    # Start with auto-reload
pnpm start  # Start production server
```

## Deployment

Deploy to Render using the included `render.yaml` configuration.

See [MIGRATION_GUIDE.md](../../MIGRATION_GUIDE.md) for deployment instructions.
