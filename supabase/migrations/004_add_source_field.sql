-- Add source field to notifications_raw table to track data origin
ALTER TABLE notifications_raw 
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'webhook';

-- Update existing records based on their characteristics
-- Records with received_at but no processed_at are likely from history API
UPDATE notifications_raw 
SET source = 'history_api' 
WHERE source IS NULL OR source = 'webhook';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_raw_source ON notifications_raw(source);

-- Add comment to document the field
COMMENT ON COLUMN notifications_raw.source IS 'Source of the notification: webhook (real-time from Apple) or history_api (historical data import)';