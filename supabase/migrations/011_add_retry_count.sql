-- Add retry_count column to notifications_raw table for failed notification retries
ALTER TABLE notifications_raw 
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Add index for efficient querying of failed notifications
CREATE INDEX IF NOT EXISTS idx_notifications_raw_retry ON notifications_raw(status, retry_count) 
WHERE status = 'failed';

-- Comment on the new column
COMMENT ON COLUMN notifications_raw.retry_count IS 'Number of retry attempts for failed notifications. Max 3 retries.';