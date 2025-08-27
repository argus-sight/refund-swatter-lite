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
    -- 0 = accessed, 1 = active subscription, 2 = not accessed
    IF v_content_accessed THEN
        v_consumption_status := 0;
    ELSIF v_has_active_subscription THEN
        v_consumption_status := 1;
    ELSE
        v_consumption_status := 2;
    END IF;
    
    -- Calculate delivery_status (0-5 based on usage)
    SELECT COALESCE(
        (metric_value->>'total_minutes')::INTEGER / 60, -- Convert minutes to hours
        0
    ) INTO v_play_time
    FROM usage_metrics
    WHERE app_account_token = v_app_account_token
    AND metric_type = 'play_time'
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Set delivery_status based on play time
    IF v_play_time = 0 THEN
        v_delivery_status := 5; -- Not delivered
    ELSIF v_play_time < 1 THEN
        v_delivery_status := 4; -- Minimal delivery
    ELSIF v_play_time < 5 THEN
        v_delivery_status := 3; -- Partial delivery
    ELSIF v_play_time < 20 THEN
        v_delivery_status := 2; -- Substantial delivery
    ELSIF v_play_time < 50 THEN
        v_delivery_status := 1; -- Near complete
    ELSE
        v_delivery_status := 0; -- Fully delivered
    END IF;
    
    -- Platform (always 1 for Apple)
    v_platform := 1;
    
    -- Calculate refund_preference based on refund rate
    IF v_transaction_count = 0 THEN
        v_refund_preference := 2; -- No preference
    ELSIF v_refund_count::FLOAT / v_transaction_count > 0.5 THEN
        v_refund_preference := 0; -- High refund rate
    ELSIF v_refund_count::FLOAT / v_transaction_count > 0.2 THEN
        v_refund_preference := 1; -- Medium refund rate
    ELSE
        v_refund_preference := 2; -- Low refund rate
    END IF;
    
    -- Calculate user_status
    IF v_lifetime_dollars_purchased = 0 THEN
        v_user_status := 4; -- Never purchased
    ELSIF v_lifetime_dollars_refunded::FLOAT / v_lifetime_dollars_purchased > 0.8 THEN
        v_user_status := 0; -- Problematic
    ELSIF v_lifetime_dollars_refunded::FLOAT / v_lifetime_dollars_purchased > 0.5 THEN
        v_user_status := 1; -- High risk
    ELSIF v_lifetime_dollars_refunded::FLOAT / v_lifetime_dollars_purchased > 0.2 THEN
        v_user_status := 2; -- Medium risk
    ELSIF v_has_active_subscription THEN
        v_user_status := 4; -- Active subscriber
    ELSE
        v_user_status := 3; -- Good standing
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