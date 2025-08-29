-- Add signed_date column to notifications_raw table
-- This column stores the signedDate from Apple's notification payload
ALTER TABLE notifications_raw 
ADD COLUMN IF NOT EXISTS signed_date TIMESTAMPTZ;

-- Add index for signed_date to improve query performance
CREATE INDEX IF NOT EXISTS idx_notifications_raw_signed_date 
ON notifications_raw(signed_date);

-- Add comment to document the column
COMMENT ON COLUMN notifications_raw.signed_date IS 'The signedDate from Apple notification payload, indicating when the notification was signed by Apple';