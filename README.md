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

## Testing

The project includes a comprehensive test suite using Vitest and React Testing Library.

### Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once (for CI)
npm test -- --run

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Test Coverage

Tests cover critical flows including:
- Utility functions (currency formatting, progress calculation)
- PIN validation and company code entry
- UI components (Toast notifications)
- Supabase integration mocking

### Writing Tests

- Test files are located next to their source files with `.test.js` or `.test.jsx` extension
- Use `src/test/setup.js` for global test configuration
- Supabase client is automatically mocked in tests

### CI/CD

The project uses GitHub Actions for continuous integration:
- Tests run automatically on every push and pull request
- Build verification ensures production bundle integrity
- All 59 tests must pass before merge

## Security

### Dependency Audit

- **Status**: 1 known vulnerability (high severity)
- **Package**: xlsx (Excel export functionality)
- **Issue**: Prototype Pollution & ReDoS - no fix currently available
- **Mitigation**: Only used for T&M report exports; does not process untrusted data
- All other vulnerabilities resolved (upgraded Vitest 2.1.8 → 4.0.16, happy-dom 15.11.7 → 20.0.11)

Run `npm audit` for current status.

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Supabase (PostgreSQL + Realtime)
- **Styling**: Custom CSS (no frameworks)
- **Testing**: Vitest + React Testing Library
- **Hosting**: Vercel (recommended)

## Project Structure

```
fieldsync/
├── src/
│   ├── components/
│   │   ├── Dashboard.jsx   # Office view
│   │   ├── Field.jsx       # Field crew view
│   │   ├── Setup.jsx       # New project form
│   │   └── Toast.jsx       # Notifications
│   ├── lib/
│   │   ├── supabase.js     # Database client
│   │   └── utils.js        # Helper functions
│   ├── App.jsx             # Main app
│   ├── main.jsx            # Entry point
│   └── index.css           # Styles
├── database/
│   └── schema.sql          # Database setup
└── index.html
```

## License

MIT
