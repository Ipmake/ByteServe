# FileGrave - TypeScript Monorepo

A modern TypeScript monorepo project with Express + Prisma backend and React + Material-UI frontend.

## 🏗️ Project Structure

```
FileGrave/
├── packages/
│   ├── backend/          # Express + Prisma API
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── routes/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── data/         # PGlite database (gitignored)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── frontend/         # React + MUI + Vite
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── api.ts
│   │   │   ├── pages/
│   │   │   ├── states/
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/           # Shared TypeScript types
│       ├── src/
│       │   ├── types.ts  # Global type declarations
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── package.json          # Root workspace config
└── tsconfig.json         # Shared TypeScript config
```

## 🚀 Technologies

### Backend
- **Express.js** - Web framework
- **Prisma** - ORM for database management
- **PGlite** - Embedded PostgreSQL (no server required!)
- **TypeScript** - Type-safe JavaScript
- **Joi** - Request validation

### Frontend
- **React 18** - UI library
- **Material-UI (MUI)** - Component library with custom dark theme
- **Axios** - HTTP client
- **React Router** - Client-side routing
- **Zustand** - State management
- **Vite** - Build tool
- **TypeScript** - Type-safe JavaScript

### Shared
- **Global Type Declarations** - Shared types across frontend and backend
- **No imports needed** - Types available globally via `Models.*` and `API.*` namespaces

## 📋 Prerequisites

- Node.js 18+ and npm
- No database server needed! (Uses PGlite embedded database)

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
# Install all workspace dependencies
npm install
```

### 2. Configure Backend

```bash
# Navigate to backend and create .env file
cd packages/backend
cp .env.example .env
```

Edit `packages/backend/.env` with your database credentials:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/filegrave?schema=public"
PORT=3001
NODE_ENV=development
```

### 3. Setup Prisma

```bash
# Generate Prisma Client
npm run prisma:generate --workspace=backend

# Run database migrations
npm run prisma:migrate --workspace=backend
```

### 4. Configure Frontend

```bash
# Navigate to frontend and create .env file
cd ../frontend
cp .env.example .env
```

The default configuration should work:
```env
VITE_API_URL=http://localhost:3001/api
```

## 🏃 Running the Application

### Development Mode (Both servers)

```bash
# From the root directory, start both backend and frontend
npm run dev
```

This will start:
- Backend API on http://localhost:3001
- Frontend on http://localhost:3000

### Run Individually

```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

## 🏗️ Building for Production

```bash
# Build both packages
npm run build

# Build individually
npm run build:backend
npm run build:frontend
```

## 📚 API Endpoints

### Health Check
- `GET /api/health` - Check if API is running

### Users
- `GET /api/users` - Get all users
- `POST /api/users` - Create a new user
  ```json
  {
    "email": "user@example.com",
    "name": "John Doe"
  }
  ```

### Files
- `GET /api/files` - Get all files
- `POST /api/files` - Create a file record
  ```json
  {
    "filename": "file123.pdf",
    "originalName": "document.pdf",
    "mimeType": "application/pdf",
    "size": 1024,
    "userId": "user-uuid"
  }
  ```

## 🗄️ Database Schema

The project includes a basic Prisma schema with:
- **User** model - Store user information
- **File** model - Store file metadata

View the full schema in `packages/backend/prisma/schema.prisma`

### Prisma Commands

```bash
# Open Prisma Studio (visual database editor)
npm run prisma:studio --workspace=backend

# Create a new migration
npm run prisma:migrate --workspace=backend

# Generate Prisma Client after schema changes
npm run prisma:generate --workspace=backend
```

## 🔧 Development Tools

### TypeScript

Both packages use TypeScript with strict mode enabled. Shared configuration is in the root `tsconfig.json`.

### Workspace Commands

```bash
# Run a command in a specific workspace
npm run <script> --workspace=<package-name>

# Example: Run dev in backend
npm run dev --workspace=backend
```

## 📝 Project Scripts

### Root Package
- `npm run dev` - Start both backend and frontend
- `npm run build` - Build both packages
- `npm run dev:backend` - Start backend only
- `npm run dev:frontend` - Start frontend only

### Backend Package
- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Run production build

### Frontend Package
- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🤝 Contributing

1. Make changes in the appropriate package
2. Test locally using `npm run dev`
3. Build to ensure no errors: `npm run build`
4. Commit your changes

## 📄 License

MIT

## 🆘 Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Check DATABASE_URL in `packages/backend/.env`
- Run migrations: `npm run prisma:migrate --workspace=backend`

### Frontend Can't Connect to Backend
- Ensure backend is running on port 3001
- Check VITE_API_URL in `packages/frontend/.env`
- Verify CORS settings in backend

### Port Already in Use
- Backend: Change PORT in `packages/backend/.env`
- Frontend: Change port in `packages/frontend/vite.config.ts`

---

Built with ❤️ using TypeScript, Express, Prisma, React, and Material-UI
