-- Enable RLS on all tables (except admin_users which already has RLS)
-- This migration ensures all tables have proper Row Level Security configured

-- 1. apple_api_logs
ALTER TABLE public.apple_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view api logs" ON public.apple_api_logs
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid()
    ));

-- 2. apple_notifications
ALTER TABLE public.apple_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage apple notifications" ON public.apple_notifications
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid()
    ));

-- 3. config
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage config" ON public.config
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid()
    ));

CREATE POLICY "Service role full access to config" ON public.config
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- 4. consumption_request_webhooks
ALTER TABLE public.consumption_request_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view consumption webhooks" ON public.consumption_request_webhooks
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid()
    ));

CREATE POLICY "Service role can insert webhooks" ON public.consumption_request_webhooks
    FOR INSERT
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- 5. consumption_requests
ALTER TABLE public.consumption_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage consumption requests" ON public.consumption_requests
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid()
    ));

-- 6. notifications_raw
ALTER TABLE public.notifications_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage raw notifications" ON public.notifications_raw
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid()
    ));

CREATE POLICY "Service role can insert notifications" ON public.notifications_raw
    FOR INSERT
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- 7. refunds
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage refunds" ON public.refunds
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid()
    ));

-- 8. send_consumption_jobs
ALTER TABLE public.send_consumption_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage consumption jobs" ON public.send_consumption_jobs
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid()
    ));

-- 9. transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage transactions" ON public.transactions
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid()
    ));

-- 10. usage_metrics
ALTER TABLE public.usage_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view usage metrics" ON public.usage_metrics
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid()
    ));

-- Grant necessary permissions
GRANT ALL ON public.apple_api_logs TO authenticated;
GRANT ALL ON public.apple_notifications TO authenticated;
GRANT ALL ON public.config TO authenticated;
GRANT ALL ON public.consumption_request_webhooks TO authenticated;
GRANT ALL ON public.consumption_requests TO authenticated;
GRANT ALL ON public.notifications_raw TO authenticated;
GRANT ALL ON public.refunds TO authenticated;
GRANT ALL ON public.send_consumption_jobs TO authenticated;
GRANT ALL ON public.transactions TO authenticated;
GRANT ALL ON public.usage_metrics TO authenticated;