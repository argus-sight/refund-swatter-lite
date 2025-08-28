-- Add retry fields to notifications_raw table for robust error handling
ALTER TABLE notifications_raw 
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient querying of failed notifications
CREATE INDEX IF NOT EXISTS idx_notifications_raw_status_retry 
ON notifications_raw(status, retry_count, last_retry_at) 
WHERE status IN ('pending', 'failed');

-- Add failed_permanent status for notifications that exceeded retry limit
ALTER TABLE notifications_raw 
DROP CONSTRAINT IF EXISTS notifications_raw_status_check;

ALTER TABLE notifications_raw 
ADD CONSTRAINT notifications_raw_status_check 
CHECK (status IN ('pending', 'processed', 'failed', 'failed_permanent'));

-- Add comment to document the fields
COMMENT ON COLUMN notifications_raw.retry_count IS 'Number of processing retry attempts';
COMMENT ON COLUMN notifications_raw.last_retry_at IS 'Timestamp of the last retry attempt';

-- Create a function to get pending notifications stats (optional, useful for monitoring)
CREATE OR REPLACE FUNCTION get_notification_stats()
RETURNS TABLE (
    status TEXT,
    count BIGINT,
    oldest_pending TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.status::TEXT,
        COUNT(*)::BIGINT as count,
        MIN(CASE WHEN n.status = 'pending' THEN n.received_at ELSE NULL END) as oldest_pending
    FROM notifications_raw n
    GROUP BY n.status;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get retry statistics (optional, useful for monitoring)
CREATE OR REPLACE FUNCTION get_retry_stats()
RETURNS TABLE (
    retry_count INTEGER,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.retry_count,
        COUNT(*)::BIGINT as count
    FROM notifications_raw n
    WHERE n.status IN ('pending', 'failed', 'failed_permanent')
      AND n.retry_count > 0
    GROUP BY n.retry_count
    ORDER BY n.retry_count;
END;
$$ LANGUAGE plpgsql;