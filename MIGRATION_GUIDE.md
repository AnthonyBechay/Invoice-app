# Invoice App Migration Guide: Firebase to Node.js Backend

This guide explains the migration from a Firebase-only architecture to a **monorepo** with separate backend (Node.js on Render) and frontend (React on Vercel) deployments.

## Architecture Overview

### Before (Firebase-only)
- Frontend: React app directly calling Firebase SDK
- Database: Firestore
- Auth: Firebase Auth (client-side)
- Deployment: Firebase Hosting

### After (Monorepo with Backend)
- **Frontend**: React app calling REST API
  - Deployed on: Vercel
  - Auth: Firebase Auth (client-side only)

- **Backend**: Node.js Express server
  - Deployed on: Render
  - Database: Firebase Admin SDK → Firestore
  - Auth: Firebase Admin SDK for token verification

## Project Structure

```
Invoice-app/
├── packages/
│   ├── frontend/          # React application
│   │   ├── src/
│   │   │   ├── api/       # API client for backend
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── firebase/  # Firebase Auth only
│   │   ├── package.json
│   │   └── vercel.json
│   │
│   └── backend/           # Node.js Express server
│       ├── src/
│       │   ├── config/    # Firebase Admin config
│       │   ├── middleware/
│       │   ├── routes/
│       │   └── server.js
│       ├── package.json
│       └── render.yaml
│
├── package.json           # Root package.json
└── pnpm-workspace.yaml    # pnpm workspace config
```

## Setup Instructions

### Prerequisites
- Node.js 18+
- pnpm 8+ (`npm install -g pnpm`)
- Firebase project with Firestore
- Render account (free tier available)
- Vercel account (free tier available)

### 1. Install Dependencies

```bash
# From the root directory
pnpm install
```

This will install dependencies for both frontend and backend packages.

### 2. Backend Configuration

#### Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings → Service Accounts
4. Click "Generate New Private Key"
5. Save the JSON file as `packages/backend/serviceAccountKey.json`

#### Set Up Backend Environment Variables

```bash
cd packages/backend
cp .env.example .env
```

Edit `.env` and update:
```env
PORT=5000
NODE_ENV=development
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
FRONTEND_URL=http://localhost:3000
```

### 3. Frontend Configuration

```bash
cd packages/frontend
cp .env.example .env
```

Edit `.env`:
```env
REACT_APP_API_URL=http://localhost:5000/api
```

### 4. Run Development Servers

#### Option 1: Run both together (from root)
```bash
pnpm dev
```

#### Option 2: Run separately

Terminal 1 (Backend):
```bash
cd packages/backend
pnpm dev
```

Terminal 2 (Frontend):
```bash
cd packages/frontend
pnpm dev
```

The frontend will be available at `http://localhost:3000` and the backend at `http://localhost:5000`.

## Deployment

### Deploy Backend to Render

1. **Create a new Web Service on Render**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "Web Service"
   - Connect your Git repository
   - Configure:
     - **Name**: invoice-app-backend
     - **Root Directory**: `packages/backend`
     - **Environment**: Node
     - **Build Command**: `pnpm install`
     - **Start Command**: `pnpm start`

2. **Set Environment Variables on Render**
   - `NODE_ENV=production`
   - `PORT=5000` (or leave empty to use Render's default)
   - `FRONTEND_URL=https://your-frontend-url.vercel.app`
   - **Firebase credentials** (choose one method):

     **Method 1**: Individual environment variables
     - `FIREBASE_PROJECT_ID=your-project-id`
     - `FIREBASE_CLIENT_EMAIL=your-client-email`
     - `FIREBASE_PRIVATE_KEY=your-private-key` (include the full key with \\n for line breaks)

     **Method 2**: Service account file
     - Upload `serviceAccountKey.json` via Render's file upload feature
     - Set `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json`

3. **Deploy**
   - Render will automatically deploy on git push
   - Note your backend URL: `https://your-backend.onrender.com`

### Deploy Frontend to Vercel

1. **Create a new Project on Vercel**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New" → "Project"
   - Import your Git repository
   - Configure:
     - **Framework Preset**: Create React App
     - **Root Directory**: `packages/frontend`
     - **Build Command**: `pnpm build`
     - **Output Directory**: `build`
     - **Install Command**: `pnpm install`

2. **Set Environment Variables on Vercel**
   - `REACT_APP_API_URL=https://your-backend.onrender.com/api`

3. **Deploy**
   - Vercel will automatically deploy on git push
   - Your frontend will be live at `https://your-app.vercel.app`

4. **Update Backend CORS**
   - Go back to Render and update `FRONTEND_URL` to your Vercel URL
   - Redeploy the backend

## API Endpoints

The backend provides the following REST API endpoints:

### Authentication
- `GET /api/auth/verify` - Verify Firebase token

### Clients
- `GET /api/clients` - Get all clients
- `GET /api/clients/:id` - Get client by ID
- `GET /api/clients/next-id` - Get next sequential client ID
- `POST /api/clients` - Create new client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client
- `POST /api/clients/batch` - Batch import clients

### Stock
- `GET /api/stock` - Get all stock items
- `GET /api/stock/:id` - Get stock item by ID
- `POST /api/stock` - Create stock item
- `PUT /api/stock/:id` - Update stock item
- `DELETE /api/stock/:id` - Delete stock item
- `POST /api/stock/batch` - Batch import stock items

### Documents (Proformas & Invoices)
- `GET /api/documents?type=proforma` - Get all proformas
- `GET /api/documents?type=invoice` - Get all invoices
- `GET /api/documents/:id` - Get document by ID
- `POST /api/documents` - Create document
- `PUT /api/documents/:id` - Update document
- `DELETE /api/documents/:id` - Delete document
- `POST /api/documents/:id/convert` - Convert proforma to invoice

### Payments
- `GET /api/payments` - Get all payments
- `GET /api/payments/:id` - Get payment by ID
- `POST /api/payments` - Create payment
- `PUT /api/payments/:id` - Update payment
- `DELETE /api/payments/:id` - Delete payment

### Expenses
- `GET /api/expenses` - Get all expenses
- `GET /api/expenses/:id` - Get expense by ID
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense

### Settings
- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update user settings

All endpoints (except `/health` and `/api/auth/verify`) require a Firebase authentication token in the `Authorization` header:

```
Authorization: Bearer <firebase-id-token>
```

## Frontend API Usage

The frontend now uses API client functions instead of direct Firebase calls:

```javascript
import { clientsApi } from '../api/client';

// Get all clients
const clients = await clientsApi.getAll();

// Create a client
const newClient = await clientsApi.create({
  name: 'John Doe',
  email: 'john@example.com',
  phone: '1234567890'
});

// Update a client
await clientsApi.update(clientId, updatedData);

// Delete a client
await clientsApi.delete(clientId);
```

Similar APIs are available for `stockApi`, `documentsApi`, `paymentsApi`, `expensesApi`, and `settingsApi`.

## Migration Checklist

- [ ] Install pnpm globally
- [ ] Run `pnpm install` in root directory
- [ ] Set up Firebase Service Account Key
- [ ] Configure backend `.env` file
- [ ] Configure frontend `.env` file
- [ ] Test locally with `pnpm dev`
- [ ] Deploy backend to Render
- [ ] Set all environment variables on Render
- [ ] Deploy frontend to Vercel
- [ ] Set environment variables on Vercel
- [ ] Update backend CORS with production frontend URL
- [ ] Test production deployment

## Troubleshooting

### Backend won't start
- Check if Firebase Service Account Key is properly configured
- Verify all environment variables are set
- Check logs for Firebase Admin initialization errors

### Frontend can't connect to backend
- Verify `REACT_APP_API_URL` is set correctly
- Check CORS configuration on backend
- Ensure backend is running and accessible

### Authentication errors
- Make sure Firebase Auth is still configured on the frontend
- Verify the auth token is being sent in API requests
- Check backend token verification middleware

### CORS errors in production
- Update `FRONTEND_URL` on Render to match your Vercel domain
- Ensure both HTTP and HTTPS are handled correctly

## Benefits of This Architecture

1. **Separation of Concerns**: Frontend and backend can be developed, tested, and deployed independently
2. **Scalability**: Backend can be scaled separately and can handle server-side logic
3. **Security**: Firebase Admin SDK credentials stay on the server
4. **Flexibility**: Easy to add new features, integrations, or switch databases in the future
5. **Better Performance**: API calls can be optimized, cached, and rate-limited on the server
6. **Cost Control**: Better control over Firebase usage and costs

## Support

For issues or questions:
- Check the error logs in Render/Vercel dashboards
- Review the API documentation above
- Check Firebase Console for any authentication or database issues
