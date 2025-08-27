-- Fix for ambiguous column reference in get_consumption_metrics_summary function
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