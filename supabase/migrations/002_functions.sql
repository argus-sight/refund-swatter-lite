-- Function to calculate consumption data for a transaction
CREATE OR REPLACE FUNCTION calculate_consumption_data(
    p_original_transaction_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSONB;
    v_account_tenure INTEGER;
    v_app_account_token TEXT;
    v_consumption_status INTEGER;
    v_delivery_status INTEGER;
    v_lifetime_dollars_purchased INTEGER;
    v_lifetime_dollars_refunded INTEGER;
    v_platform INTEGER;
    v_play_time INTEGER;
    v_refund_preference INTEGER;
    v_user_status INTEGER;
    v_first_purchase_date TIMESTAMPTZ;
    v_total_purchased DECIMAL;
    v_total_refunded DECIMAL;
    v_refund_count INTEGER;
    v_transaction_count INTEGER;
    v_has_active_subscription BOOLEAN;
    v_content_accessed BOOLEAN;
BEGIN
    -- Get app_account_token from the transaction
    SELECT app_account_token INTO v_app_account_token
    FROM transactions
    WHERE original_transaction_id = p_original_transaction_id
    LIMIT 1;
    
    -- If no app_account_token, use a default approach
    IF v_app_account_token IS NULL THEN
        v_app_account_token := p_original_transaction_id;
    END IF;
    
    -- Calculate account tenure
    SELECT MIN(purchase_date) INTO v_first_purchase_date
    FROM transactions
    WHERE app_account_token = v_app_account_token;
    
    IF v_first_purchase_date IS NOT NULL THEN
        v_account_tenure := EXTRACT(DAY FROM NOW() - v_first_purchase_date)::INTEGER;
    ELSE
        v_account_tenure := 0;
    END IF;
    
    -- Calculate lifetime dollars purchased
    SELECT COALESCE(SUM(price), 0)::INTEGER INTO v_lifetime_dollars_purchased
    FROM transactions
    WHERE app_account_token = v_app_account_token;
    
    -- Calculate lifetime dollars refunded
    SELECT COALESCE(SUM(r.refund_amount), 0)::INTEGER INTO v_lifetime_dollars_refunded
    FROM refunds r
    JOIN transactions t ON t.transaction_id = r.transaction_id
    WHERE t.app_account_token = v_app_account_token;
    
    -- Get refund statistics
    SELECT COUNT(*) INTO v_refund_count
    FROM refunds r
    JOIN transactions t ON t.transaction_id = r.transaction_id
    WHERE t.app_account_token = v_app_account_token;
    
    SELECT COUNT(*) INTO v_transaction_count
    FROM transactions
    WHERE app_account_token = v_app_account_token;
    
    -- Check for active subscription
    SELECT EXISTS(
        SELECT 1 FROM transactions
        WHERE app_account_token = v_app_account_token
        AND product_type = 'auto_renewable'
        AND expiration_date > NOW()
    ) INTO v_has_active_subscription;
    
    -- Check if content was accessed (from usage_metrics)
    SELECT EXISTS(
        SELECT 1 FROM usage_metrics
        WHERE app_account_token = v_app_account_token
        AND metric_type = 'content_accessed'
    ) INTO v_content_accessed;
    
    -- Calculate consumption_status
    -- 0 = undeclared, 1 = not consumed, 2 = partially consumed, 3 = fully consumed
    -- For now, use simplified logic (to be improved with actual consumption tracking)
    IF v_content_accessed THEN
        v_consumption_status := 2; -- Partially consumed (simplified)
    ELSIF v_has_active_subscription THEN
        v_consumption_status := 1; -- Not consumed
    ELSE
        v_consumption_status := 0; -- Undeclared
    END IF;
    
    -- Set delivery_status to 0 (successfully delivered and working properly)
    -- Developers are responsible for ensuring successful delivery before sending consumption info
    v_delivery_status := 0;
    
    -- Calculate play time from usage metrics
    SELECT COALESCE(
        (metric_value->>'total_minutes')::INTEGER / 60, -- Convert minutes to hours
        0
    ) INTO v_play_time
    FROM usage_metrics
    WHERE app_account_token = v_app_account_token
    AND metric_type = 'play_time'
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Platform (always 1 for Apple)
    v_platform := 1;
    
    -- Get refund_preference from config table
    SELECT refund_preference INTO v_refund_preference
    FROM config
    WHERE id = 1;
    
    -- If not configured, default to 0 (undeclared)
    v_refund_preference := COALESCE(v_refund_preference, 0);
    
    -- Calculate user_status (Apple definition)
    -- 0 = undeclared, 1 = active, 2 = suspended, 3 = terminated, 4 = limited access
    -- Using simplified logic - in production should track actual account status
    IF v_lifetime_dollars_purchased = 0 THEN
        v_user_status := 0; -- Undeclared (no purchase history)
    ELSIF v_has_active_subscription THEN
        v_user_status := 1; -- Active (has active subscription)
    ELSE
        v_user_status := 1; -- Default to active (simplified implementation)
    END IF;
    
    -- Build the consumption data JSON
    v_result := jsonb_build_object(
        'accountTenure', v_account_tenure,
        'appAccountToken', v_app_account_token,
        'consumptionStatus', v_consumption_status,
        'customerConsented', true,
        'deliveryStatus', v_delivery_status,
        'lifetimeDollarsPurchased', v_lifetime_dollars_purchased,
        'lifetimeDollarsRefunded', v_lifetime_dollars_refunded,
        'platform', v_platform,
        'playTime', v_play_time,
        'refundPreference', v_refund_preference,
        'sampleContentProvided', false,
        'userStatus', v_user_status
    );
    
    RETURN v_result;
END;
$$;

-- Function to process a consumption request
CREATE OR REPLACE FUNCTION process_consumption_request(
    p_request_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_original_transaction_id TEXT;
    v_consumption_data JSONB;
BEGIN
    -- Get the original transaction ID
    SELECT original_transaction_id INTO v_original_transaction_id
    FROM consumption_requests
    WHERE id = p_request_id;
    
    IF v_original_transaction_id IS NULL THEN
        RAISE EXCEPTION 'Consumption request not found: %', p_request_id;
    END IF;
    
    -- Calculate consumption data
    v_consumption_data := calculate_consumption_data(v_original_transaction_id);
    
    -- Create a job to send the consumption data
    INSERT INTO send_consumption_jobs (
        consumption_request_id,
        consumption_data,
        status,
        scheduled_at
    ) VALUES (
        p_request_id,
        v_consumption_data,
        'pending',
        NOW()
    );
    
    -- Update request status
    UPDATE consumption_requests
    SET status = 'calculating',
        updated_at = NOW()
    WHERE id = p_request_id;
END;
$$;

-- Function to get consumption metrics summary
CREATE OR REPLACE FUNCTION get_consumption_metrics_summary()
RETURNS TABLE (
    total_requests BIGINT,
    sent_successfully BIGINT,
    failed_requests BIGINT,
    pending_requests BIGINT,
    avg_response_time_ms NUMERIC,
    success_rate NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_requests,
        COUNT(*) FILTER (WHERE cr.status = 'sent')::BIGINT as sent_successfully,
        COUNT(*) FILTER (WHERE cr.status = 'failed')::BIGINT as failed_requests,
        COUNT(*) FILTER (WHERE cr.status IN ('pending', 'calculating'))::BIGINT as pending_requests,
        ROUND(AVG(EXTRACT(EPOCH FROM (scj.sent_at - scj.created_at)) * 1000) FILTER (WHERE scj.sent_at IS NOT NULL), 2) as avg_response_time_ms,
        ROUND((COUNT(*) FILTER (WHERE cr.status = 'sent')::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as success_rate
    FROM consumption_requests cr
    LEFT JOIN send_consumption_jobs scj ON scj.consumption_request_id = cr.id
    WHERE cr.created_at > NOW() - INTERVAL '30 days';
END;
$$;

-- Function to cleanup old data (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_data(p_days_to_keep INTEGER DEFAULT 180)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete old notifications
    DELETE FROM notifications_raw 
    WHERE received_at < NOW() - (p_days_to_keep || ' days')::INTERVAL
    AND status = 'processed';
    
    -- Delete old API logs
    DELETE FROM apple_api_logs
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Delete old processed jobs
    DELETE FROM send_consumption_jobs
    WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL
    AND status IN ('sent', 'failed');
END;
$$;