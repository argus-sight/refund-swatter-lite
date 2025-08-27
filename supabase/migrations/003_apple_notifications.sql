-- Apple notifications table for storing historical notification data
-- This table stores notification history fetched from Apple's API
CREATE TABLE IF NOT EXISTS apple_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_uuid VARCHAR(255) NOT NULL UNIQUE,
    notification_type VARCHAR(100) NOT NULL,
    subtype VARCHAR(100),
    version VARCHAR(50),
    signed_date TIMESTAMPTZ,
    data JSONB,
    summary JSONB,
    external_purchase_token TEXT,
    app_apple_id BIGINT,
    bundle_id VARCHAR(255),
    bundle_version VARCHAR(50),
    environment VARCHAR(50), -- Production/Sandbox
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_apple_notifications_uuid ON apple_notifications(notification_uuid);
CREATE INDEX IF NOT EXISTS idx_apple_notifications_type ON apple_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_apple_notifications_environment ON apple_notifications(environment);
CREATE INDEX IF NOT EXISTS idx_apple_notifications_signed_date ON apple_notifications(signed_date);
CREATE INDEX IF NOT EXISTS idx_apple_notifications_bundle_id ON apple_notifications(bundle_id);

-- Add notes column to apple_api_logs for better tracking
ALTER TABLE apple_api_logs ADD COLUMN IF NOT EXISTS notes TEXT;