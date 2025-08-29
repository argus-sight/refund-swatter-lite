# REST API to Edge Functions Migration Plan

## Overview
This document outlines the plan to migrate from direct Supabase REST API usage to Edge Functions for improved security, performance, and maintainability.

## Current Issues

### Security Concerns
- Database table structure is directly exposed to the frontend
- Client knows all field names and relationships
- Vulnerable to data exploration attacks
- No business logic layer for validation

### Performance Issues
- Multiple requests needed (N+1 problem)
- No server-side caching
- Inefficient data aggregation
- No query optimization

### Maintenance Problems
- Database changes directly impact frontend
- No API versioning capability
- Difficult to track and monitor usage
- Tight coupling between frontend and database

## Components Currently Using Direct Supabase Access

1. **NotificationList Component** (`/web/src/components/NotificationList.tsx`)
   - Directly queries `notifications_raw` table
   - Lines 32, 48: `.from('notifications_raw')`

2. **Home Page** (`/web/src/app/page.tsx`)
   - Line 19: `.from('config')`
   - Checking configuration status

3. **Test Webhook API** (`/web/src/app/api/test-webhook/route.ts`)
   - Line 16: `.from('config')`
   - Getting configuration for testing

4. **Config API Route** (`/web/src/app/api/config/route.ts`)
   - Lines 9, 35: `.from('config')`
   - Managing configuration

## Migration Plan

### Phase 1: Create Edge Functions

#### 1.1 Notifications Edge Function
**Path:** `/supabase/functions/get-notifications/index.ts`

**Functionality:**
```typescript
interface GetNotificationsParams {
  environment?: 'Sandbox' | 'Production'
  status?: 'pending' | 'processed' | 'failed'
  limit?: number
  offset?: number
  orderBy?: 'signed_date' | 'received_at'
  order?: 'asc' | 'desc'
}

// Returns processed notification data
// Hides internal fields
// Adds computed fields if needed
```

#### 1.2 Configuration Management Edge Function
**Path:** `/supabase/functions/manage-config/index.ts`

**Functionality:**
```typescript
// GET: Returns configuration without sensitive fields
// PUT: Updates configuration with validation
// Handles private key storage internally
// Never exposes apple_private_key_id
```

### Phase 2: Create/Update API Routes

#### 2.1 Notifications API Route
**Path:** `/web/src/app/api/notifications/route.ts`

```typescript
// Proxy to Edge Function
// Add caching headers
// Handle errors gracefully
// Log for monitoring
```

#### 2.2 Update Config API Route
**Current:** Directly uses Supabase client
**New:** Call manage-config Edge Function

### Phase 3: Update Frontend Components

#### 3.1 NotificationList Component
```typescript
// Before:
const { data } = await supabase
  .from('notifications_raw')
  .select('*')
  .eq('environment', environment)
  .order('signed_date', { ascending: false })

// After:
const response = await fetch('/api/notifications?' + new URLSearchParams({
  environment,
  orderBy: 'signed_date',
  order: 'desc'
}))
const data = await response.json()
```

#### 3.2 Home Page (page.tsx)
```typescript
// Before:
const { data: config } = await supabase
  .from('config')
  .select('apple_issuer_id, apple_key_id, apple_private_key_id')
  .single()

// After:
const response = await fetch('/api/config')
const config = await response.json()
```

### Phase 4: Security Enhancements

#### 4.1 Row Level Security (RLS)
```sql
-- Enable RLS on sensitive tables
ALTER TABLE notifications_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policies for service role only
CREATE POLICY "Service role only" ON notifications_raw
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only" ON config
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only" ON transactions
  FOR ALL USING (auth.role() = 'service_role');
```

#### 4.2 Remove Direct Database Access
- Remove NEXT_PUBLIC_SUPABASE_ANON_KEY from frontend
- Only use service role key in Edge Functions
- All database access through Edge Functions

## Benefits After Migration

| Aspect | Current (REST API) | After (Edge Functions) |
|--------|-------------------|------------------------|
| Security | Exposed table structure | Hidden implementation |
| Flexibility | CRUD only | Any business logic |
| Performance | Multiple requests | Batch operations |
| Caching | Client-side only | Server-side caching |
| Monitoring | Limited | Complete logging |
| Maintenance | Tightly coupled | Loosely coupled |
| Versioning | Not possible | API versioning |

## Implementation Timeline

### Week 1
- Create Edge Functions for notifications and config
- Test Edge Functions independently

### Week 2
- Create/update API routes
- Implement error handling and logging

### Week 3
- Update frontend components one by one
- Test each component after update

### Week 4
- Enable RLS policies
- Remove direct database access
- Final testing and optimization

## Estimated Effort

- Edge Functions creation: 2-3 hours
- API Routes update: 1-2 hours
- Frontend components update: 1-2 hours
- Testing and debugging: 1-2 hours
- Documentation: 1 hour

**Total: 6-10 hours**

## Rollback Plan

If issues occur during migration:
1. Keep original code in separate branches
2. Use feature flags to toggle between old and new implementation
3. Monitor error rates and performance metrics
4. Rollback individual components if needed

## Success Metrics

- Zero direct database queries from frontend
- All data access through Edge Functions
- Improved response times (target: <200ms)
- Reduced data transfer (only needed fields)
- Complete audit trail of data access

## Future Enhancements

Once migration is complete, consider:
1. Add caching layer (Redis)
2. Implement rate limiting
3. Add API versioning
4. Create analytics Edge Function
5. Implement batch operations
6. Add WebSocket support for real-time updates

## Notes

- Keep backward compatibility during migration
- Test thoroughly in staging environment
- Monitor performance metrics
- Document all Edge Functions
- Create OpenAPI specifications