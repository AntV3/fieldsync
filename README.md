# FieldSync

A construction progress tracking app that connects field crews to the office with real-time visibility.

## Features

- **Office Dashboard**: See overall project progress and billable amounts at a glance
- **Field App**: Simple one-tap status updates for field crews
- **Real-time Sync**: Changes sync instantly between field and office (when using Supabase)
- **Binary Progress**: No guessing - areas are either "Working" or "Done"
- **Defensible Billing**: Progress ties directly to contract value for clear billing

## Quick Start (Demo Mode)

The app works immediately in demo mode, storing data in your browser's localStorage.

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Production Setup with Supabase

For real multi-device sync, you'll need to set up Supabase (free tier works fine).

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Wait for it to initialize

### 2. Set Up the Database

1. In your Supabase dashboard, go to **SQL Editor**
2. Copy the contents of `database/schema.sql`
3. Paste and run it

### 3. Get Your API Keys

1. Go to **Settings** > **API**
2. Copy your **Project URL** and **anon public** key

### 4. Configure the App

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 5. Run the App

```bash
npm run dev
```

Now data will sync across all devices in real-time!

## Deployment

### Deploy to Vercel (Recommended)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repo
3. Add your environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)
4. Deploy

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` folder.

## Usage

### Office (Dashboard)

1. Create a new project with name and contract value
2. Define areas (e.g., Level 1, Level 2, Exterior) with percentage weights
3. View real-time progress as field crews update status

### Field (Mobile)

1. Open the Field tab on your phone
2. Select your project
3. Tap "Working" when you start an area
4. Tap "Done" when it's complete

That's it. Under 15 seconds to update.

## Tech Stack

- **Frontend**: React 19 + Vite 7
- **Backend**: Supabase (PostgreSQL + Realtime + Storage)
- **Styling**: Custom CSS with CSS variables (light/dark theme)
- **Icons**: Lucide React
- **PDF Export**: jsPDF + jspdf-autotable
- **Charts**: Recharts
- **Hosting**: Vercel (recommended)

## Project Structure

```
fieldsync/
├── src/
│   ├── components/
│   │   ├── AppEntry.jsx           # Login / join / register flows
│   │   ├── Dashboard.jsx          # Office dashboard
│   │   ├── ForemanView.jsx        # Field crew view
│   │   ├── Setup.jsx              # New project form
│   │   ├── TMList.jsx             # T&M ticket list
│   │   ├── TMForm.jsx             # T&M ticket creation
│   │   ├── billing/               # Invoices, draw requests
│   │   ├── cor/                   # Change Order Request workflow
│   │   ├── dashboard/             # Dashboard sub-components & tabs
│   │   ├── documents/             # Document management
│   │   ├── equipment/             # Equipment tracking
│   │   ├── tm/                    # T&M step components
│   │   └── ui/                    # Shared UI primitives
│   ├── hooks/                     # Custom React hooks
│   ├── lib/
│   │   ├── supabase.js            # Database facade (100+ methods)
│   │   ├── offlineManager.js      # IndexedDB offline queue
│   │   ├── corExportPipeline.js   # COR PDF export orchestrator
│   │   └── ...                    # Other utilities
│   ├── styles/                    # Feature-scoped CSS modules
│   ├── test/                      # Vitest unit tests
│   ├── App.jsx                    # Root component & view router
│   └── main.jsx                   # Entry point
├── database/                      # SQL migrations (manual)
├── supabase/migrations/           # Supabase CLI migrations
├── docs/                          # Architecture & developer guides
└── index.html
```

## UI Component Library

The app includes a set of reusable UI components in `src/components/ui/`:

### Skeleton Components
Loading placeholders for improved perceived performance:
- `Skeleton` - Base skeleton element
- `MetricSkeleton` - For metric cards
- `CardSkeleton` - For content cards
- `TicketSkeleton` - For T&M tickets
- `HeroMetricsSkeleton` - For hero metrics section

### Micro-Visualizations
Small, glanceable data displays:
- `CountBadge` - Numeric badges with optional icons
- `MiniProgress` - Compact progress bars
- `TrendIndicator` - Up/down trend arrows with percentages
- `StatusDot` - Color-coded status indicators
- `Sparkline` - Mini trend charts
- `CircularProgress` - Radial progress indicators

## License

MIT
