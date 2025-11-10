# Invoice App - Frontend

React frontend for the Invoice App.

## Tech Stack

- **Framework**: React 18
- **Styling**: Tailwind CSS
- **PDF Generation**: jsPDF + html2canvas
- **CSV Parsing**: PapaParse
- **Auth**: JWT Authentication
- **API Client**: Fetch API with custom client wrapper

## Environment Variables

Create a `.env` file:

```env
REACT_APP_API_URL=http://localhost:5000/api
```

For production, update to your Render backend URL:
```env
REACT_APP_API_URL=https://your-backend.onrender.com/api
```

## Development

```bash
pnpm dev     # Start development server
pnpm build   # Build for production
```

## Deployment

Deploy to Vercel using the included `vercel.json` configuration.

See [MIGRATION_GUIDE.md](../../MIGRATION_GUIDE.md) for deployment instructions.

## Features

- Dashboard with overview statistics
- Client management with CSV import/export
- Stock/inventory tracking
- Proforma creation and management
- Invoice generation from proformas
- Payment tracking
- Expense management
- Settings configuration
- PDF export for documents
- Real-time authentication

## API Usage

The frontend uses a centralized API client located in `src/api/client.js`:

```javascript
import { clientsApi } from '../api/client';

// Fetch all clients
const clients = await clientsApi.getAll();

// Create a new client
const newClient = await clientsApi.create(clientData);
```

All API calls automatically include JWT authentication tokens.
