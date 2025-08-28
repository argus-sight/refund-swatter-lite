-- Add notes column to apple_api_logs table for additional context
ALTER TABLE apple_api_logs 
ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN apple_api_logs.notes IS 'Additional notes or context about the API call';