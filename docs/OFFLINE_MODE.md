# FieldSync Offline Mode Documentation

## Overview

FieldSync now supports **offline-first operation** for field workers, allowing them to:
- Create T&M tickets without internet
- Take compressed photos offline
- Check in crew members
- Submit daily reports
- Update area status

All offline data is automatically synced to Supabase when the network is restored.

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                 OFFLINE MODE ARCHITECTURE                │
└─────────────────────────────────────────────────────────┘

┌──────────────────┐
│   Field Worker   │
│   (Offline)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐      ┌──────────────────┐
│   offlineDb.js   │◄────►│  IndexedDB       │
│   (Wrapper)      │      │  (Local Storage) │
└────────┬─────────┘      └──────────────────┘
         │
         ▼
┌──────────────────┐
│   syncQueue.js   │
│   (Queue Mgr)    │
└────────┬─────────┘
         │
         ▼ (when online)
┌──────────────────┐
│   Supabase       │
│   (Server)       │
└──────────────────┘
```

### File Structure

```
src/
├── lib/
│   ├── offlineStorage.js      # IndexedDB wrapper (idb library)
│   ├── syncQueue.js            # Sync queue management
│   ├── networkStatus.js        # Online/offline detection
│   ├── photoCompression.js     # Photo compression (browser-image-compression)
│   ├── offlineDb.js            # Offline-enabled database wrapper
│   └── userContextManager.js   # Audit trail user tracking
├── components/
│   └── OfflineIndicator.jsx    # Status bar UI
└── hooks/
    └── useSync.js              # React hook for sync operations
```

---

## Key Features

### 1. **IndexedDB Storage**

All field data is stored locally using IndexedDB:

- **Projects** - Cached for offline access
- **Areas** - Cached with status updates
- **T&M Tickets** - Created offline, synced later
- **T&M Workers & Items** - Associated with tickets
- **Crew Check-ins** - Saved offline
- **Daily Reports** - Compiled and submitted offline
- **Material Requests** - Created offline
- **Photos** - Compressed and stored as base64

**Storage capacity:** ~50MB (enough for 200-250 compressed photos)

### 2. **Photo Compression**

Photos are compressed before storage to save space:

- **Original size:** 2-5 MB (typical phone camera)
- **Compressed size:** 100-200 KB (70% quality, 800x800px max)
- **Compression ratio:** ~90-95% reduction
- **Library:** `browser-image-compression`

Photos are uploaded to Supabase Storage when network is restored.

### 3. **Sync Queue**

Operations are queued for synchronization:

```javascript
{
  id: 'uuid',
  operation: 'CREATE',      // CREATE, UPDATE, DELETE, UPLOAD_PHOTO
  table: 't_and_m_tickets',
  data: { ... },
  priority: 1,              // 1=high, 2=medium, 3=low
  category: 'field_data',   // 'field_data', 'photos'
  status: 'pending',        // 'pending', 'syncing', 'synced', 'failed'
  retries: 0,
  timestamp: '2025-12-11T...'
}
```

**Sync Priority:**
1. **High (1):** T&M tickets, projects, area updates
2. **Medium (2):** Crew check-ins, daily reports, material requests
3. **Low (3):** Photos (uploaded in background)

### 4. **Network Detection**

Real-time monitoring of network status:

- Uses browser `online`/`offline` events
- Auto-syncs when network is restored
- Provides `useNetworkStatus()` React hook
- Shows visual indicator in UI

### 5. **Audit Trails**

All records track who created/modified them:

**Database Fields:**
- `created_by_id` - User ID
- `created_by_name` - User name (foreman certification)
- `created_at` - Timestamp
- `updated_by_id` - User ID
- `updated_by_name` - User name
- `updated_at` - Timestamp

**User Context:**
Stored in IndexedDB and attached to all operations:
```javascript
{
  userId: 'uuid',
  userName: 'John Doe',
  userEmail: 'john@example.com',
  role: 'foreman'
}
```

---

## Usage

### For Field Workers

#### **1. Accessing Offline Mode**

When you lose internet connection:
- The app automatically switches to offline mode
- A status bar appears at the bottom: **"🔴 Offline Mode | 3 items pending sync"**
- All features continue to work normally

#### **2. Creating T&M Tickets Offline**

```javascript
import offlineDb from '../lib/offlineDb'

// Create ticket (works offline)
const ticket = await offlineDb.createTMTicket({
  project_id: projectId,
  work_date: '2025-12-11',
  notes: 'Asbestos removal Level 1',
  photos: []
})

// Add workers
await offlineDb.addTMWorkers(ticket.id, [
  { name: 'John Doe', hours: 8, role: 'Foreman' }
])

// Add items
await offlineDb.addTMItems(ticket.id, [
  { material_equipment_id: 'uuid', quantity: 10 }
])

// Ticket saved offline ✅
// Will sync when online
```

#### **3. Taking Photos Offline**

```javascript
import { compressPhoto } from '../lib/photoCompression'
import offlineDb from '../lib/offlineDb'

// Compress photo
const { base64, compressedSize } = await compressPhoto(file)

// Save offline
await offlineDb.saveOfflinePhoto(ticketId, base64, file.name)

// Photo queued for upload ✅
```

#### **4. Viewing Sync Status**

The `OfflineIndicator` component shows:
- **Online/Offline status**
- **Pending sync count**
- **"Syncing..." indicator** when active
- **"Sync Now" button** (when online with pending items)
- **Last sync time**
- **Error messages** (if sync fails)

#### **5. Manual Sync**

```javascript
import { useSync } from '../hooks/useSync'

function MyComponent() {
  const { sync, isSyncing, pendingCount } = useSync()

  const handleSync = async () => {
    try {
      const results = await sync()
      console.log(`✅ Synced ${results.synced} items`)
    } catch (error) {
      console.error('Sync failed:', error)
    }
  }

  return (
    <button onClick={handleSync} disabled={isSyncing}>
      Sync Now ({pendingCount} pending)
    </button>
  )
}
```

---

## Database Schema Updates

Run the migration to add audit fields:

```sql
-- database/audit_trail_migration.sql
psql $DATABASE_URL -f database/audit_trail_migration.sql
```

Or run in Supabase SQL Editor.

**New Fields Added:**
- `projects`: `created_by_id`, `created_by_name`, `updated_by_id`, `updated_by_name`
- `areas`: `created_by_id`, `created_by_name`, `updated_by_id`, `updated_by_name`
- `t_and_m_tickets`: `created_by_id`, `created_by_name`, `updated_by_id`, `updated_by_name`
- All tables: Triggers to auto-update `updated_at`

---

## Configuration

### Environment Variables

No additional configuration needed! Offline mode works automatically.

Optional (for fine-tuning):

```javascript
// src/lib/photoCompression.js
const DEFAULT_OPTIONS = {
  maxSizeMB: 0.2,           // 200KB max
  maxWidthOrHeight: 800,    // 800px max dimension
  initialQuality: 0.7,      // 70% quality
}

// src/lib/syncQueue.js
const MAX_RETRIES = 5       // Retry failed syncs 5 times
const BASE_DELAY = 1000     // 1 second base delay
const MAX_DELAY = 30000     // 30 seconds max delay
```

---

## Sync Behavior

### When Does Sync Happen?

1. **Auto-sync on network restoration** - When offline→online
2. **Auto-sync on immediate operations** - When online, syncs immediately
3. **Manual sync** - Click "Sync Now" button
4. **Background retry** - Failed operations retry with exponential backoff

### Retry Logic

```
Attempt 1: Immediate
Attempt 2: Wait 2 seconds
Attempt 3: Wait 4 seconds
Attempt 4: Wait 8 seconds
Attempt 5: Wait 16 seconds
After 5 failures: Mark as permanently failed
```

### Conflict Resolution

**Strategy: "Field Wins"**

- Field worker updates (area status, etc.) override office changes
- Server timestamps used for "Last Write Wins" on other data
- Conflicts logged in sync queue for review

---

## API Reference

### offlineStorage.js

```javascript
// User context
await setUserContext(userId, userName, userEmail, role)
const context = await getUserContext()
await clearUserContext()

// Projects
await saveProject(project)
const project = await getProject(projectId)
const projects = await getAllProjects()

// T&M Tickets
await saveTMTicket(ticket)
const tickets = await getTMTicketsByProject(projectId)
const pending = await getPendingTMTickets()

// Photos
await savePhoto({ id, ticket_id, base64, fileName, upload_status })
const photos = await getPhotosByTicket(ticketId)
const pending = await getPendingPhotos()

// Storage stats
const stats = await getStorageStats()
await clearAllOfflineData()
```

### syncQueue.js

```javascript
// Add to queue
await addToSyncQueue({
  operation: 'CREATE',
  table: 't_and_m_tickets',
  data: { ... },
  priority: 1,
  category: 'field_data'
})

// Sync operations
const pending = await getPendingSyncOperations()
const count = await getSyncQueueCount()
const results = await syncAllPending(db, onProgress)

// Stats
const stats = await getSyncQueueStats()
await clearSyncedOperations()
```

### networkStatus.js

```javascript
// Network status
const online = isOnline()
const cleanup = initNetworkMonitoring()

// React hook
const isOnline = useNetworkStatus()

// Wait for network
await waitForNetwork(timeout)

// Check quality
const quality = await getNetworkQuality() // 'excellent', 'good', 'fair', 'poor', 'offline'
```

### photoCompression.js

```javascript
// Compress photos
const result = await compressPhoto(file, options)
// Returns: { compressed, base64, originalSize, compressedSize, compressionRatio }

const results = await compressPhotos(files, onProgress)

// Utilities
const valid = isValidImage(file)
const size = formatFileSize(bytes)
const capacity = estimatePhotoCapacity()
const hasSpace = await hasStorageCapacity(requiredBytes)
```

### useSync.js (React Hook)

```javascript
const {
  isOnline,       // boolean
  isSyncing,      // boolean
  pendingCount,   // number
  syncStats,      // { total, pending, synced, failed, ... }
  lastSyncTime,   // Date | null
  lastError,      // string | null
  sync,           // () => Promise<results>
  updateStats,    // () => Promise<void>
} = useSync()
```

---

## Testing Offline Mode

### 1. **Simulate Offline in Chrome DevTools**

1. Open DevTools (F12)
2. Go to **Network** tab
3. Change throttling dropdown to **"Offline"**
4. Test creating tickets, photos, etc.
5. Change back to **"Online"**
6. Watch sync happen automatically

### 2. **Check IndexedDB**

1. Open DevTools (F12)
2. Go to **Application** tab
3. Expand **IndexedDB** → **fieldsync-offline**
4. Inspect stores: `tm_tickets`, `photos`, `sync_queue`, etc.

### 3. **Monitor Console**

Look for these log messages:

```
📡 Network status initialized: ONLINE
🔴 Network: OFFLINE
📸 Compressing photo: photo.jpg (2.3MB)
✅ Compressed to: 145KB
✅ T&M Ticket saved offline: uuid
⏳ Waiting for network to retry operation...
🟢 Network: ONLINE
🔄 Starting sync...
✅ Sync complete: { synced: 5, failed: 0 }
```

---

## Troubleshooting

### Problem: Photos not uploading

**Cause:** IndexedDB quota exceeded
**Solution:** Clear old photos after sync

```javascript
import { clearStore, STORES } from '../lib/offlineStorage'
await clearStore(STORES.PHOTOS)
```

### Problem: Sync stuck on "Syncing..."

**Cause:** Network request timeout
**Solution:** Check Supabase connection, refresh page

### Problem: Audit trail shows "Unknown User"

**Cause:** User context not initialized
**Solution:** Ensure `initializeUserContext()` called on login

```javascript
await initializeUserContext({
  id: user.id,
  name: user.full_name,
  email: user.email,
  role: 'foreman'
})
```

### Problem: Data not syncing to Supabase

**Check:**
1. Supabase URL and key configured in `.env`
2. Network actually online (not just browser says so)
3. Check browser console for errors
4. Verify Supabase RLS policies allow insert/update

---

## Best Practices

### For Developers

1. **Always use `offlineDb` instead of `db`** for field operations
2. **Initialize user context** on login/foreman access
3. **Clear user context** on logout
4. **Compress photos** before saving
5. **Show sync status** to users (use OfflineIndicator)
6. **Handle sync errors** gracefully
7. **Test offline scenarios** regularly

### For Field Workers

1. **Sync before leaving site** - Click "Sync Now" when you have internet
2. **Don't close browser** during sync
3. **Check sync status** before creating critical tickets
4. **Take compressed photos** - App handles this automatically
5. **Report sync errors** to office if they persist

---

## Performance

### Storage Usage

| Data Type | Avg Size | Capacity (50MB) |
|-----------|----------|-----------------|
| T&M Ticket | 5 KB | ~10,000 tickets |
| Compressed Photo | 150 KB | ~330 photos |
| Crew Check-in | 2 KB | ~25,000 check-ins |
| Daily Report | 10 KB | ~5,000 reports |

**Recommendation:** Sync daily to keep storage usage low.

### Sync Speed

- **T&M Tickets:** ~100ms per ticket
- **Photos:** ~500ms per photo (depends on network)
- **Crew Check-ins:** ~50ms each
- **100 pending items:** ~10-30 seconds total

---

## Roadmap

### Future Enhancements

- [ ] **Progressive Web App (PWA)** - Install as native app
- [ ] **Background Sync** - Sync even when app closed (Service Workers)
- [ ] **Conflict Resolution UI** - Manual conflict resolution for office
- [ ] **Offline Maps** - Cache job site locations
- [ ] **Voice Notes** - Record audio offline
- [ ] **PDF Generation** - Generate T&M PDFs offline
- [ ] **Multi-user Collaboration** - Real-time sync with conflict detection

---

## Support

For issues or questions:
- Check console logs for errors
- Review sync queue stats: `getSyncQueueStats()`
- Clear offline data if corrupted: `clearAllOfflineData()`
- Contact support with sync queue errors

**Happy Offline Building! 🏗️📱**
