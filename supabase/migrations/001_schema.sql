-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "vault";

-- Config table (single row only for single tenant)
-- Note: Webhook URL is fixed at {SUPABASE_URL}/functions/v1/webhook
CREATE TABLE config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Ensures single row
    bundle_id TEXT NOT NULL,
    apple_issuer_id TEXT NOT NULL,
    apple_key_id TEXT NOT NULL,
    apple_private_key_id UUID, -- Reference to vault secret
    environment TEXT DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
    refund_preference INTEGER DEFAULT 0 CHECK (refund_preference IN (0, 1, 2, 3)), -- 0=Undeclared, 1=Prefer grant, 2=Prefer decline, 3=No preference
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw notifications storage (no tenant_id needed)
CREATE TABLE notifications_raw (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_type VARCHAR(100) NOT NULL,
    subtype VARCHAR(100),
    notification_uuid VARCHAR(100) NOT NULL,
    signed_payload TEXT NOT NULL,
    decoded_payload JSONB NOT NULL,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'pending', -- pending/processed/failed
    error_message TEXT,
    environment VARCHAR(50), -- Production/Sandbox
    UNIQUE(notification_uuid)
);

-- Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_transaction_id VARCHAR(255) NOT NULL,
    transaction_id VARCHAR(255) NOT NULL,
    product_id VARCHAR(255) NOT NULL,
    product_type VARCHAR(50), -- consumable/auto_renewable/non_consumable/non_renewing
    purchase_date TIMESTAMPTZ NOT NULL,
    original_purchase_date TIMESTAMPTZ,
    expiration_date TIMESTAMPTZ,
    price DECIMAL(10, 2),
    currency VARCHAR(10),
    quantity INTEGER DEFAULT 1,
    app_account_token TEXT,
    in_app_ownership_type VARCHAR(50), -- PURCHASED/FAMILY_SHARED
    environment VARCHAR(50), -- Production/Sandbox
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(transaction_id)
);

-- Refunds table
CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id VARCHAR(255) NOT NULL,
    original_transaction_id VARCHAR(255) NOT NULL,
    refund_date TIMESTAMPTZ NOT NULL,
    refund_amount DECIMAL(10, 2),
    refund_reason VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(transaction_id, refund_date)
);

-- Consumption requests table
CREATE TABLE consumption_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID REFERENCES notifications_raw(id),
    original_transaction_id VARCHAR(255) NOT NULL,
    consumption_request_reason VARCHAR(100),
    request_date TIMESTAMPTZ NOT NULL,
    deadline TIMESTAMPTZ NOT NULL, -- 12 hours from request
    status VARCHAR(50) DEFAULT 'pending', -- pending/calculating/sent/failed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(original_transaction_id, request_date)
);

-- Send consumption jobs table
CREATE TABLE send_consumption_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consumption_request_id UUID NOT NULL REFERENCES consumption_requests(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- pending/processing/sent/failed
    consumption_data JSONB,
    response_data JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage metrics table
CREATE TABLE usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_account_token VARCHAR(255),
    metric_type VARCHAR(50) NOT NULL, -- play_time, content_accessed, etc.
    metric_value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Apple API logs table
CREATE TABLE apple_api_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consumption_request_id UUID REFERENCES consumption_requests(id),
    endpoint TEXT NOT NULL,
    method VARCHAR(10) NOT NULL,
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_headers JSONB,
    response_body JSONB,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_notifications_raw_status ON notifications_raw(status);
CREATE INDEX idx_notifications_raw_notification_uuid ON notifications_raw(notification_uuid);
CREATE INDEX idx_transactions_original_id ON transactions(original_transaction_id);
CREATE INDEX idx_transactions_app_account ON transactions(app_account_token);
CREATE INDEX idx_refunds_transaction ON refunds(original_transaction_id);
CREATE INDEX idx_consumption_requests_status ON consumption_requests(status);
CREATE INDEX idx_consumption_requests_deadline ON consumption_requests(deadline);
CREATE INDEX idx_consumption_jobs_status ON send_consumption_jobs(status);
CREATE INDEX idx_consumption_jobs_scheduled ON send_consumption_jobs(scheduled_at);
CREATE INDEX idx_usage_metrics_token ON usage_metrics(app_account_token);
CREATE INDEX idx_usage_metrics_created ON usage_metrics(created_at);

-- Vault function for storing private key using vault.create_secret()
CREATE OR REPLACE FUNCTION store_apple_private_key(p_private_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id UUID;
    v_existing_id UUID;
BEGIN
    -- Get existing secret ID if any
    SELECT apple_private_key_id INTO v_existing_id FROM config WHERE id = 1;
    
    -- If there's an existing secret, delete it first
    IF v_existing_id IS NOT NULL THEN
        DELETE FROM vault.secrets WHERE id = v_existing_id;
    END IF;
    
    -- Create new secret using vault.create_secret()
    v_secret_id := vault.create_secret(p_private_key, 'apple_private_key');
    
    -- Update config with the new secret ID
    UPDATE config SET 
        apple_private_key_id = v_secret_id,
        updated_at = NOW()
    WHERE id = 1;
    
    RETURN v_secret_id;
END;
$$;

-- Function to retrieve private key (for edge functions only)
CREATE OR REPLACE FUNCTION get_apple_private_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id UUID;
    v_private_key TEXT;
BEGIN
    SELECT apple_private_key_id INTO v_secret_id FROM config WHERE id = 1;
    
    IF v_secret_id IS NULL THEN
        RAISE EXCEPTION 'Apple private key not configured';
    END IF;
    
    SELECT decrypted_secret INTO v_private_key 
    FROM vault.decrypted_secrets 
    WHERE id = v_secret_id;
    
    IF v_private_key IS NULL THEN
        RAISE EXCEPTION 'Apple private key not found in vault';
    END IF;
    
    RETURN v_private_key;
END;
$$;

-- Insert default config row
INSERT INTO config (bundle_id, apple_issuer_id, apple_key_id, environment, refund_preference)
VALUES ('com.example.app', '', '', 'sandbox', 0)
ON CONFLICT (id) DO NOTHING;