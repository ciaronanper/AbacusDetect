# AbacusDetect

## Overview

AbacusDetect is a medical diagnostic workflow application designed for point-of-care testing. It guides healthcare professionals (nurses) through patient identification and SAA2 biomarker testing on the physical MicroNow reader. The application is built as a mobile-first React frontend with an Express backend, optimized for use on handheld devices in clinical settings.

The physical reader is the **host**: it streams line-based messages over serial (115200 8N1, CRLF-terminated) that tell the app which screen to show. After the app scans the nurse and patient QR codes (rear camera), the assay flow is **device-driven** — insert-cartridge, apply-sample, sample-detected, checking, and result screens appear only in response to the reader's serial messages, and the only on-screen control during that flow is a power button.

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

3. **Device-Driven Workflow**: The main `Workflow.tsx` page has app-controlled phases (`connect` → `nurse-scan` → `patient-scan` → `running`). In the `running` phase the UI renders purely from `readerState.currentView`, which is derived from the reader's incoming serial messages — the app does not advance the assay on its own.

4. **Component Library**: Uses shadcn/ui (new-york style) for consistent, accessible UI primitives built on Radix UI.

5. **Session-guarded async on the result screen**: every async completion (result auto-save, voice-note upload, health-record push) captures a per-test session token and abandons all state updates if "New Test"/"Home" has run since — a late response must never mark the next patient's test as pushed or attach data to the wrong row. The result-row create is single-flight (auto-save and push await one shared promise), so duplicate rows can't be created by races.

### Physical Reader Integration
- **Protocol** (`client/src/lib/readerProtocol.ts`): a TypeScript port of the reference Flutter `ReaderProtocol`. `applyMessage` reduces each serial line into `ReaderState`. `SCREEN:DISPLAYRESULT` is the **only** result-bearing screen — every other screen clears `resultText`, so it is the single trigger to display and persist a result. A missing/NaN result is never shown as `0`; it renders a "result unavailable / retest" state.
- **Transport** (`client/src/lib/readerConnection.ts`): a `ReaderConnection` interface with three implementations — `WebSerialConnection` (real hardware on desktop Chrome/Edge), `CapacitorSerialConnection` (real hardware on the packaged Android app, via the native `ReaderSerial` plugin), and `SimulatorConnection` (inject lines by hand). The `useReader` hook owns the connection, selects the native transport when `Capacitor.isNativePlatform()` is true, and exposes the derived state, logs, and button commands.
- **Power button**: sends `"0 BUTTON"` (press) / `"0 BUTTON_UP"` (release), matching the real firmware handshake.
- **QR scanning** (`client/src/components/QrScanner.tsx`): real rear-camera scanning via jsQR (`facingMode: environment`) with a manual-entry fallback when the camera is unavailable.
- **Sandbox note**: Web Serial and the camera are blocked in the Replit preview iframe, so the flow is verified here via the simulator panel (visible only when connected via the simulator) and the manual-entry fallback.

### Data Storage Detail
- The `results` table stores `value` (double precision) + `units` (text, default `mg/L`) as sent by the device (`RESULT:<value>:<units>`); `level`/`interpretation` come from the SAA2 5-band classification (`classifyValue`).
- `results.pushedToRecordAt` is stamped by `POST /api/results/:id/push` (the result screen's "Push to Health Record" button). A real EHR/FHIR hand-off would hook into that endpoint before the stamp.
- The `voice_notes` table holds nurse-recorded audio observations per result (`client/src/components/VoiceNotes.tsx`, MediaRecorder webm/opus, 2-minute cap, base64 inline, cascade delete). Create/list endpoints return metadata only; raw bytes stream from `GET /api/voice-notes/:id/audio`. Notes stay local blobs until the push uploads them.

### Android App (Capacitor)
The web app is packaged as a native Android app with Capacitor so the app itself owns the USB connection to the reader (USB host / OTG), mirroring the reference Flutter app. Build/run instructions live in `ANDROID.md`.
- **Config** (`capacitor.config.ts`): appId `com.abacuslabs.abacusdetect`, `webDir: dist/public`. `CapacitorHttp` is enabled so the packaged app's `fetch` calls reach the deployed backend without CORS restrictions.
- **Native plugin** (`android/app/src/main/java/com/abacuslabs/abacusdetect/ReaderSerialPlugin.java`): a Capacitor plugin named `ReaderSerial` built on `usb-serial-for-android` (the library the Flutter `usb_serial` plugin wraps). It opens the first serial device at 115200 8N1 with DTR/RTS high, reads CRLF-framed lines on a background thread (`line` events), reports connection state (`status` events), and writes commands with a trailing CRLF — parity with the Flutter `UsbService`. Registered in `MainActivity.java`.
- **Device matching** (`android/app/src/main/res/xml/device_filter.xml`): lists common serial-chip vendor IDs and auto-launches the app on plug-in; add the reader's real VID/PID (decimal) if it is not detected.
- **Results backend**: set `VITE_API_BASE_URL` (see `client/.env.example`) to the deployed URL before building; `client/src/lib/apiBase.ts` prefixes API calls with it **only on native** (relative URLs on web). Save failures degrade gracefully — the diagnostic flow never depends on the network.
- **Building the APK**: the Replit container has no Android SDK/JDK, so the APK is not built here. The repo contains the full Capacitor project; build and run it from Android Studio. USB and camera only work on a physical device.

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