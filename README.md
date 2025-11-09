# Invoice App - Monorepo

A modern invoice management application with a Node.js backend (deployed on Render) and React frontend (deployed on Vercel).

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm 8+ (`npm install -g pnpm`)

### Development Setup

1. **Install all dependencies**
   ```bash
   pnpm install
   ```

2. **Configure Backend**
   ```bash
   cd packages/backend
   cp .env.example .env
   # Add your Firebase service account credentials
   ```

3. **Configure Frontend**
   ```bash
   cd packages/frontend
   cp .env.example .env
   # Set REACT_APP_API_URL=http://localhost:5000/api
   ```

4. **Run Development Servers**
   ```bash
   # From root directory
   pnpm dev
   ```

   Or run individually:
   ```bash
   # Terminal 1: Backend
   cd packages/backend && pnpm dev

   # Terminal 2: Frontend
   cd packages/frontend && pnpm dev
   ```

5. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - Health Check: http://localhost:5000/health

## Project Structure

```
Invoice-app/
├── packages/
│   ├── frontend/          # React application
│   └── backend/           # Node.js Express API
├── package.json           # Root package (workspace config)
├── pnpm-workspace.yaml    # pnpm workspace definition
└── MIGRATION_GUIDE.md     # Detailed migration & deployment guide
```

## Deployment

- **Backend**: Deploy to Render (see [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md))
- **Frontend**: Deploy to Vercel (see [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md))

## Documentation

- [Migration Guide](./MIGRATION_GUIDE.md) - Complete setup, deployment, and API documentation
- [Frontend README](./packages/frontend/README.md) - Frontend-specific documentation
- [Backend README](./packages/backend/README.md) - Backend API documentation

## Architecture

- **Frontend**: React + Firebase Auth (client-side only)
- **Backend**: Node.js + Express + Firebase Admin SDK
- **Database**: Firestore (accessed via backend)
- **Auth**: Firebase Authentication

## Key Features

- Client management
- Stock/inventory tracking
- Proforma and invoice generation
- Payment tracking
- Expense management
- User settings
- PDF export capabilities
- CSV import/export

## Scripts

- `pnpm dev` - Run both frontend and backend in development mode
- `pnpm build` - Build both packages
- `pnpm start` - Start both packages in production mode

## License

Private project