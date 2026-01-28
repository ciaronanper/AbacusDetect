# AbacusDetect

## Overview

AbacusDetect is a medical diagnostic workflow application designed for point-of-care testing. It guides healthcare professionals (nurses) through a step-by-step process of patient identification, sample collection, and SAA2 biomarker testing. The application is built as a mobile-first React frontend with an Express backend, optimized for use on handheld devices in clinical settings.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React useState for local UI state
- **Styling**: Tailwind CSS with CSS variables for theming, shadcn/ui component library
- **Animations**: Framer Motion for smooth page transitions and workflow step animations
- **Build Tool**: Vite with path aliases (`@/` for client src, `@shared/` for shared code)

### Backend Architecture
- **Framework**: Express 5 on Node.js
- **Language**: TypeScript with ES modules
- **API Pattern**: REST endpoints with Zod validation on both client and server
- **Route Definition**: Centralized API contracts in `shared/routes.ts` with type-safe schemas

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Drizzle Kit with `db:push` command

### Project Structure
```
client/           # React frontend
  src/
    components/   # Reusable UI components
    components/ui # shadcn/ui primitives
    hooks/        # Custom React hooks
    pages/        # Route components
    lib/          # Utilities and query client
server/           # Express backend
  index.ts        # Server entry point
  routes.ts       # API route handlers
  storage.ts      # Database operations
  db.ts           # Database connection
shared/           # Shared code between client/server
  schema.ts       # Drizzle database schema
  routes.ts       # API contract definitions
```

### Key Design Decisions

1. **Shared API Contracts**: The `shared/routes.ts` file defines API endpoints, HTTP methods, input schemas, and response types. Both client hooks and server routes reference these definitions, ensuring type safety across the stack.

2. **Mobile-First UI**: Custom components like `ActionButton`, `StatusCard`, and `Header` are designed for touch interfaces with large tap targets and clear visual feedback.

3. **Workflow State Machine**: The main `Workflow.tsx` page implements a multi-step process using a simple state machine pattern with a `Step` union type.

4. **Component Library**: Uses shadcn/ui (new-york style) for consistent, accessible UI primitives built on Radix UI.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe query builder and schema management

### Frontend Libraries
- **@tanstack/react-query**: Async state management and caching
- **framer-motion**: Animation library for transitions
- **lucide-react**: Icon set
- **Radix UI**: Accessible component primitives (via shadcn/ui)

### Build & Development
- **Vite**: Frontend build tool with HMR
- **esbuild**: Server bundling for production
- **tsx**: TypeScript execution for development

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Development error overlay
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development banner