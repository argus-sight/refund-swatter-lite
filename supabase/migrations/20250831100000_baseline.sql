
-- Enable required extensions first
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA extensions;

-- Grant necessary permissions for pg_cron
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."calculate_consumption_data"("p_original_transaction_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  v_result jsonb;
  v_customer_consented boolean := true;
  v_consumption_status integer := 0;
  v_platform integer := 1; -- 1 for Apple platform (iOS purchases are from Apple)
  v_sample_content_provided boolean := false;
  v_delivery_status integer := 0;
  v_app_account_token text;
  v_lifetime_dollars_purchased numeric := 0;
  v_lifetime_dollars_refunded numeric := 0;
  v_lifetime_dollars_purchased_enum integer := 0;  -- Default to 0 (Undeclared)
  v_lifetime_dollars_refunded_enum integer := 0;   -- Default to 0 (Undeclared)
  v_user_status integer := 0;
  v_account_tenure integer := 0;
  v_play_time_minutes integer := 0;
  v_play_time integer := 0;  -- Default to 0 (undeclared)
  v_refund_preference integer := 0; -- 0 = undeclared
  v_is_valid_uuid boolean := false;
BEGIN
  -- Get app_account_token from transaction
  SELECT app_account_token INTO v_app_account_token
  FROM transactions 
  WHERE original_transaction_id = p_original_transaction_id
  LIMIT 1;
  
  -- Check if app_account_token is a valid UUID (not null, not empty string, and valid UUID format)
  IF v_app_account_token IS NOT NULL AND v_app_account_token != '' THEN
    -- Check if it's a valid UUID format using regex
    v_is_valid_uuid := v_app_account_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  END IF;

  -- If app_account_token is not valid, set it to empty string for Apple API
  IF v_app_account_token IS NULL THEN
    v_app_account_token := '';
  END IF;

  -- Only calculate lifetime amounts if we have a valid UUID
  IF v_is_valid_uuid THEN
    -- Calculate lifetime dollars purchased for this specific user
    SELECT COALESCE(SUM(price), 0) INTO v_lifetime_dollars_purchased
    FROM transactions 
    WHERE app_account_token = v_app_account_token
      AND app_account_token != '';  -- Extra safety check

    -- Calculate lifetime dollars refunded for this specific user
    SELECT COALESCE(SUM(r.refund_amount), 0) INTO v_lifetime_dollars_refunded
    FROM refunds r
    JOIN transactions t ON r.original_transaction_id = t.original_transaction_id
    WHERE t.app_account_token = v_app_account_token
      AND t.app_account_token != '';  -- Extra safety check
      
    -- Convert to enum values
    v_lifetime_dollars_purchased_enum := get_lifetime_dollars_enum(v_lifetime_dollars_purchased);
    v_lifetime_dollars_refunded_enum := get_lifetime_dollars_enum(v_lifetime_dollars_refunded);
  ELSE
    -- If no valid app_account_token, both values should be 0 (Undeclared)
    -- NOT 1 (0 USD), because we don't know the actual values
    v_lifetime_dollars_purchased_enum := 0;
    v_lifetime_dollars_refunded_enum := 0;
  END IF;

  -- Don't calculate play time - just keep it as 0 (undeclared)
  -- This avoids providing potentially inaccurate play time data
  v_play_time := 0;
  
  -- Build result JSON
  v_result := jsonb_build_object(
    'customerConsented', v_customer_consented,
    'consumptionStatus', v_consumption_status,
    'platform', v_platform,
    'sampleContentProvided', v_sample_content_provided,
    'deliveryStatus', v_delivery_status,
    'appAccountToken', v_app_account_token,
    'lifetimeDollarsPurchased', v_lifetime_dollars_purchased_enum,
    'lifetimeDollarsRefunded', v_lifetime_dollars_refunded_enum,
    'userStatus', v_user_status,
    'accountTenure', v_account_tenure,
    'playTime', v_play_time,
    'refundPreference', v_refund_preference
  );
  
  RETURN v_result;
END;
$_$;


ALTER FUNCTION "public"."calculate_consumption_data"("p_original_transaction_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_consumption_data"("p_original_transaction_id" "text") IS 'Calculates consumption data for Apple Store Server Notifications v2 with proper enum values';



CREATE OR REPLACE FUNCTION "public"."cleanup_old_data"("p_days_to_keep" integer DEFAULT 180) RETURNS "void"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."cleanup_old_data"("p_days_to_keep" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decode_jwt_payload"("jwt_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    parts TEXT[];
    payload_base64 TEXT;
    payload_text TEXT;
BEGIN
    -- Split JWT (header.payload.signature)
    parts := string_to_array(jwt_token, '.');
    
    -- Check if there are 3 parts
    IF array_length(parts, 1) != 3 THEN
        RETURN NULL;
    END IF;
    
    -- Get payload part (second part)
    payload_base64 := parts[2];
    
    -- Base64 decode
    -- Need to pad for proper decoding
    WHILE length(payload_base64) % 4 != 0 LOOP
        payload_base64 := payload_base64 || '=';
    END LOOP;
    
    -- Decode and convert to JSON
    payload_text := convert_from(decode(payload_base64, 'base64'), 'UTF8');
    
    RETURN payload_text::JSONB;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."decode_jwt_payload"("jwt_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_apple_private_key"() RETURNS "text" -- Gets In-App Purchase Key from vault
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
DECLARE
    v_secret_id UUID;
    v_private_key TEXT;
BEGIN
    SELECT apple_private_key_id INTO v_secret_id FROM config WHERE id = 1;
    
    IF v_secret_id IS NULL THEN
        RAISE EXCEPTION 'In-App Purchase Key not configured';
    END IF;
    
    SELECT decrypted_secret INTO v_private_key 
    FROM vault.decrypted_secrets 
    WHERE id = v_secret_id;
    
    IF v_private_key IS NULL THEN
        RAISE EXCEPTION 'In-App Purchase Key not found in vault';
    END IF;
    
    RETURN v_private_key;
END;
$$;


ALTER FUNCTION "public"."get_apple_private_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_consumption_metrics_summary"("p_environment" "text" DEFAULT NULL::"text") RETURNS TABLE("total_requests" bigint, "sent_successfully" bigint, "failed_requests" bigint, "pending_requests" bigint, "avg_response_time_ms" numeric, "success_rate" numeric)
    LANGUAGE "plpgsql"
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
    WHERE cr.created_at > NOW() - INTERVAL '30 days'
      AND (p_environment IS NULL OR cr.environment = p_environment);
END;
$$;


ALTER FUNCTION "public"."get_consumption_metrics_summary"("p_environment" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_consumption_metrics_summary"("p_environment" "text") IS 'Get consumption metrics summary for the last 30 days, optionally filtered by environment';



CREATE OR REPLACE FUNCTION "public"."get_lifetime_dollars_enum"("amount_in_cents" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Convert cents to dollars
    DECLARE amount_in_dollars DECIMAL;
    BEGIN
        amount_in_dollars := amount_in_cents / 100.0;
        
        IF amount_in_dollars = 0 THEN
            RETURN 1; -- 0 USD
        ELSIF amount_in_dollars < 50 THEN
            RETURN 2; -- 0.01-49.99 USD
        ELSIF amount_in_dollars < 100 THEN
            RETURN 3; -- 50-99.99 USD
        ELSIF amount_in_dollars < 500 THEN
            RETURN 4; -- 100-499.99 USD
        ELSIF amount_in_dollars < 1000 THEN
            RETURN 5; -- 500-999.99 USD
        ELSIF amount_in_dollars < 2000 THEN
            RETURN 6; -- 1000-1999.99 USD
        ELSE
            RETURN 7; -- 2000+ USD
        END IF;
    END;
END;
$$;


ALTER FUNCTION "public"."get_lifetime_dollars_enum"("amount_in_cents" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_lifetime_dollars_enum"("amount_in_cents" integer) IS 'Converts dollar amounts to Apple enum values for lifetime purchase/refund amounts';



CREATE OR REPLACE FUNCTION "public"."get_lifetime_dollars_enum"("amount" numeric) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF amount IS NULL OR amount = 0 THEN
    RETURN 1; -- 0 USD
  ELSIF amount <= 49.99 THEN
    RETURN 2; -- 0.01-49.99 USD
  ELSIF amount <= 99.99 THEN
    RETURN 3; -- 50-99.99 USD
  ELSIF amount <= 499.99 THEN
    RETURN 4; -- 100-499.99 USD
  ELSIF amount <= 999.99 THEN
    RETURN 5; -- 500-999.99 USD
  ELSIF amount <= 1999.99 THEN
    RETURN 6; -- 1000-1999.99 USD
  ELSE
    RETURN 7; -- Over 2000 USD
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_lifetime_dollars_enum"("amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_playtime_enum"("minutes" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF minutes IS NULL OR minutes = 0 THEN
    RETURN 0; -- Undeclared
  ELSIF minutes <= 5 THEN
    RETURN 1; -- 0-5 minutes
  ELSIF minutes <= 60 THEN
    RETURN 2; -- 5-60 minutes
  ELSIF minutes <= 360 THEN -- 6 hours = 360 minutes
    RETURN 3; -- 1-6 hours
  ELSIF minutes <= 1440 THEN -- 24 hours = 1440 minutes
    RETURN 4; -- 6-24 hours
  ELSIF minutes <= 5760 THEN -- 4 days = 5760 minutes
    RETURN 5; -- 1-4 days
  ELSIF minutes <= 23040 THEN -- 16 days = 23040 minutes
    RETURN 6; -- 4-16 days
  ELSE
    RETURN 7; -- Over 16 days
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_playtime_enum"("minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_consumption_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."process_consumption_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_pending_notifications_direct"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Process all pending notifications
    UPDATE notifications_raw
    SET 
        status = 'processing',
        processed_at = NOW()
    WHERE 
        status = 'pending'
        AND received_at > NOW() - INTERVAL '24 hours';
        
    -- Log the processing attempt
    INSERT INTO apple_api_logs (
        endpoint,
        method,
        request_body,
        response_status,
        created_at
    ) VALUES (
        'cron_job',
        'INTERNAL',
        jsonb_build_object(
            'message', 'Cron job executed',
            'time', NOW()
        ),
        200,
        NOW()
    );
END;
$$;


ALTER FUNCTION "public"."process_pending_notifications_direct"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_pending_notifications_direct"() IS 'Backup function to process pending notifications if Edge Function approach fails';



CREATE OR REPLACE FUNCTION "public"."store_apple_private_key"("p_private_key" "text") RETURNS "uuid" -- Stores In-App Purchase Key in vault
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
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


ALTER FUNCTION "public"."store_apple_private_key"("p_private_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "must_change_password" boolean DEFAULT true,
    "last_login_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apple_api_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "consumption_request_id" "uuid",
    "endpoint" "text" NOT NULL,
    "method" character varying(10) NOT NULL,
    "request_headers" "jsonb",
    "request_body" "jsonb",
    "response_status" integer,
    "response_headers" "jsonb",
    "response_body" "jsonb",
    "duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."apple_api_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."apple_api_logs"."notes" IS 'Additional notes or context about the API call';



CREATE TABLE IF NOT EXISTS "public"."config" (
    "id" integer DEFAULT 1 NOT NULL,
    "bundle_id" "text" NOT NULL,
    "apple_issuer_id" "text" NOT NULL,
    "apple_key_id" "text" NOT NULL,
    "apple_private_key_id" "uuid",
    "refund_preference" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "config_id_check" CHECK (("id" = 1)),
    CONSTRAINT "config_refund_preference_check" CHECK (("refund_preference" = ANY (ARRAY[0, 1, 2, 3])))
);


ALTER TABLE "public"."config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consumption_request_webhooks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "request_id" character varying(255) NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"(),
    "source_ip" character varying(255),
    "raw_body" "text" NOT NULL,
    "parsed_body" "jsonb" NOT NULL,
    "notification_type" character varying(100),
    "subtype" character varying(100),
    "notification_uuid" character varying(255),
    "decoded_payload" "jsonb",
    "decoded_transaction_info" "jsonb",
    "original_transaction_id" character varying(255),
    "transaction_id" character varying(255),
    "product_id" character varying(255),
    "consumption_request_reason" character varying(255),
    "deadline" timestamp with time zone,
    "environment" character varying(50),
    "processing_status" character varying(50) DEFAULT 'received'::character varying,
    "error_message" "text",
    "notification_raw_id" "uuid",
    "consumption_request_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."consumption_request_webhooks" OWNER TO "postgres";


COMMENT ON TABLE "public"."consumption_request_webhooks" IS 'Stores all CONSUMPTION_REQUEST webhooks received from Apple with raw and parsed data';



COMMENT ON COLUMN "public"."consumption_request_webhooks"."raw_body" IS 'Complete raw POST body as received from Apple';



COMMENT ON COLUMN "public"."consumption_request_webhooks"."parsed_body" IS 'Parsed JSON from the raw body';



COMMENT ON COLUMN "public"."consumption_request_webhooks"."decoded_payload" IS 'Decoded JWT payload from signedPayload';



COMMENT ON COLUMN "public"."consumption_request_webhooks"."decoded_transaction_info" IS 'Decoded signedTransactionInfo from the payload';



COMMENT ON COLUMN "public"."consumption_request_webhooks"."processing_status" IS 'Status of webhook processing: received, processed, failed';



CREATE TABLE IF NOT EXISTS "public"."consumption_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "notification_id" "uuid",
    "original_transaction_id" character varying(255),
    "consumption_request_reason" character varying(100),
    "request_date" timestamp with time zone NOT NULL,
    "deadline" timestamp with time zone NOT NULL,
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "environment" "text"
);


ALTER TABLE "public"."consumption_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."consumption_requests"."original_transaction_id" IS 'Original transaction ID from Apple. May be null for certain notification types.';



COMMENT ON COLUMN "public"."consumption_requests"."environment" IS 'Apple environment (sandbox or production) where this request should be sent';



CREATE TABLE IF NOT EXISTS "public"."send_consumption_jobs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "consumption_request_id" "uuid" NOT NULL,
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "consumption_data" "jsonb",
    "response_data" "jsonb",
    "error_message" "text",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "scheduled_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "response_status_code" integer
);


ALTER TABLE "public"."send_consumption_jobs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."send_consumption_jobs"."response_status_code" IS 'HTTP status code returned by Apple API';



CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "original_transaction_id" character varying(255),
    "transaction_id" character varying(255) NOT NULL,
    "product_id" character varying(255) NOT NULL,
    "product_type" character varying(50),
    "purchase_date" timestamp with time zone NOT NULL,
    "original_purchase_date" timestamp with time zone,
    "expiration_date" timestamp with time zone,
    "price" numeric(10,2),
    "currency" character varying(10),
    "quantity" integer DEFAULT 1,
    "app_account_token" "text",
    "in_app_ownership_type" character varying(50),
    "environment" character varying(50),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."transactions"."original_transaction_id" IS 'Original transaction ID. For initial purchases, this field may be NULL or same as transaction_id. For renewals, this field points to the initial purchase transaction ID.';



COMMENT ON COLUMN "public"."transactions"."environment" IS 'Apple environment (sandbox or production) where this transaction occurred';



CREATE OR REPLACE VIEW "public"."consumption_request_details" WITH ("security_invoker"='on') AS
 SELECT DISTINCT ON ("cr"."id") "cr"."id" AS "request_id",
    "cr"."original_transaction_id",
    "cr"."consumption_request_reason",
    "cr"."request_date",
    "cr"."deadline",
    "cr"."status" AS "request_status",
    "cr"."environment",
    "cr"."created_at" AS "request_created_at",
    "cr"."updated_at" AS "request_updated_at",
    "scj"."id" AS "job_id",
    "scj"."status" AS "job_status",
    "scj"."consumption_data",
    "scj"."scheduled_at",
    "scj"."sent_at",
    "scj"."error_message",
    "scj"."retry_count",
    "scj"."response_status_code",
    "scj"."created_at" AS "job_created_at",
    "crw"."notification_uuid",
    "crw"."raw_body" AS "webhook_raw_body",
    "crw"."parsed_body" AS "webhook_parsed_body",
    "crw"."source_ip",
    "crw"."decoded_transaction_info",
    "crw"."product_id",
    "crw"."transaction_id",
    "t"."product_id" AS "transaction_product_id",
    "t"."product_type",
    "t"."price",
    "t"."currency",
    "t"."purchase_date",
    "t"."expiration_date",
        CASE
            WHEN ("scj"."sent_at" IS NOT NULL) THEN (EXTRACT(epoch FROM ("scj"."sent_at" - "cr"."created_at")) * (1000)::numeric)
            ELSE NULL::numeric
        END AS "response_time_ms",
        CASE
            WHEN ("scj"."response_status_code" IS NOT NULL) THEN
            CASE "scj"."response_status_code"
                WHEN 200 THEN 'Success (200)'::"text"
                WHEN 202 THEN 'Accepted (202)'::"text"
                WHEN 400 THEN 'Bad Request (400)'::"text"
                WHEN 401 THEN 'Unauthorized (401)'::"text"
                WHEN 403 THEN 'Forbidden (403)'::"text"
                WHEN 404 THEN 'Not Found (404)'::"text"
                WHEN 429 THEN 'Too Many Requests (429)'::"text"
                WHEN 500 THEN 'Server Error (500)'::"text"
                WHEN 503 THEN 'Service Unavailable (503)'::"text"
                ELSE ('HTTP '::"text" || ("scj"."response_status_code")::"text")
            END
            WHEN (("scj"."status")::"text" = 'sent'::"text") THEN 'Success (200)'::"text"
            WHEN ((("scj"."status")::"text" = 'failed'::"text") AND ("scj"."error_message" IS NOT NULL)) THEN
            CASE
                WHEN ("scj"."error_message" ~~ '%400%'::"text") THEN 'Bad Request (400)'::"text"
                WHEN ("scj"."error_message" ~~ '%401%'::"text") THEN 'Unauthorized (401)'::"text"
                WHEN ("scj"."error_message" ~~ '%403%'::"text") THEN 'Forbidden (403)'::"text"
                WHEN ("scj"."error_message" ~~ '%404%'::"text") THEN 'Not Found (404)'::"text"
                WHEN ("scj"."error_message" ~~ '%429%'::"text") THEN 'Too Many Requests (429)'::"text"
                WHEN ("scj"."error_message" ~~ '%500%'::"text") THEN 'Server Error (500)'::"text"
                WHEN ("scj"."error_message" ~~ '%503%'::"text") THEN 'Service Unavailable (503)'::"text"
                ELSE 'Failed'::"text"
            END
            WHEN (("scj"."status")::"text" = 'pending'::"text") THEN 'Pending'::"text"
            ELSE 'Unknown'::"text"
        END AS "apple_response_status"
   FROM ((("public"."consumption_requests" "cr"
     LEFT JOIN "public"."send_consumption_jobs" "scj" ON (("scj"."consumption_request_id" = "cr"."id")))
     LEFT JOIN "public"."consumption_request_webhooks" "crw" ON (("crw"."consumption_request_id" = "cr"."id")))
     LEFT JOIN "public"."transactions" "t" ON ((("t"."original_transaction_id")::"text" = ("cr"."original_transaction_id")::"text")))
  ORDER BY "cr"."id", "scj"."created_at" DESC NULLS LAST;


ALTER VIEW "public"."consumption_request_details" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cron_job_monitor" WITH ("security_invoker"='true') AS
 SELECT "jobid",
    "jobname",
    "schedule",
    "active",
    "username",
    "database",
    "command",
    ( SELECT "count"(*) AS "count"
           FROM "cron"."job_run_details" "d"
          WHERE (("d"."jobid" = "j"."jobid") AND ("d"."start_time" > ("now"() - '24:00:00'::interval)))) AS "runs_last_24h",
    ( SELECT "max"("d"."end_time") AS "max"
           FROM "cron"."job_run_details" "d"
          WHERE ("d"."jobid" = "j"."jobid")) AS "last_run",
    ( SELECT "d"."status"
           FROM "cron"."job_run_details" "d"
          WHERE ("d"."jobid" = "j"."jobid")
          ORDER BY "d"."start_time" DESC
         LIMIT 1) AS "last_status"
   FROM "cron"."job" "j"
  WHERE ("jobname" = ANY (ARRAY['process-pending-notifications'::"text", 'process-notifications-fallback'::"text"]));


ALTER VIEW "public"."cron_job_monitor" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cron_job_status" WITH ("security_invoker"='true') AS
 SELECT "jobid",
    "jobname",
    "schedule",
    "active",
    "username",
    "database",
    "command"
   FROM "cron"."job"
  WHERE ("jobname" = 'process-pending-notifications'::"text");


ALTER VIEW "public"."cron_job_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications_raw" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "notification_type" character varying(100) NOT NULL,
    "subtype" character varying(100),
    "notification_uuid" character varying(100) NOT NULL,
    "signed_payload" "text" NOT NULL,
    "decoded_payload" "jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "error_message" "text",
    "environment" character varying(50),
    "source" character varying(50) DEFAULT 'webhook'::character varying,
    "retry_count" integer DEFAULT 0,
    "signed_date" timestamp with time zone,
    "decoded_transaction_info" "jsonb",
    CONSTRAINT "notifications_raw_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'processed'::character varying, 'failed'::character varying])::"text"[])))
);


ALTER TABLE "public"."notifications_raw" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notifications_raw"."source" IS 'Source of the notification: webhook (real-time from Apple) or history_api (historical data import)';



COMMENT ON COLUMN "public"."notifications_raw"."retry_count" IS 'Number of retry attempts for failed notifications. Max 3 retries.';



COMMENT ON COLUMN "public"."notifications_raw"."signed_date" IS 'The signedDate from Apple notification payload, indicating when the notification was signed by Apple';



COMMENT ON COLUMN "public"."notifications_raw"."decoded_transaction_info" IS 'Decoded transaction information extracted from signedTransactionInfo JWT';



CREATE OR REPLACE VIEW "public"."recent_cron_runs" WITH ("security_invoker"='true') AS
 SELECT "jobid",
    "runid",
    "job_pid",
    "database",
    "username",
    "command",
    "status",
    "return_message",
    "start_time",
    "end_time",
    ("end_time" - "start_time") AS "duration"
   FROM "cron"."job_run_details"
  WHERE ("jobid" = ( SELECT "job"."jobid"
           FROM "cron"."job"
          WHERE ("job"."jobname" = 'process-pending-notifications'::"text")))
  ORDER BY "start_time" DESC
 LIMIT 20;


ALTER VIEW "public"."recent_cron_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "transaction_id" character varying(255) NOT NULL,
    "original_transaction_id" character varying(255) NOT NULL,
    "refund_date" timestamp with time zone NOT NULL,
    "refund_amount" numeric(10,2),
    "refund_reason" character varying(100),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "environment" "text"
);


ALTER TABLE "public"."refunds" OWNER TO "postgres";


COMMENT ON COLUMN "public"."refunds"."environment" IS 'Apple environment (sandbox or production) where this refund occurred';



CREATE TABLE IF NOT EXISTS "public"."usage_metrics" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "app_account_token" character varying(255),
    "metric_type" character varying(50) NOT NULL,
    "metric_value" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."usage_metrics" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apple_api_logs"
    ADD CONSTRAINT "apple_api_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."config"
    ADD CONSTRAINT "config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consumption_request_webhooks"
    ADD CONSTRAINT "consumption_request_webhooks_notification_uuid_key" UNIQUE ("notification_uuid");



ALTER TABLE ONLY "public"."consumption_request_webhooks"
    ADD CONSTRAINT "consumption_request_webhooks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consumption_requests"
    ADD CONSTRAINT "consumption_requests_original_transaction_id_request_date_key" UNIQUE ("original_transaction_id", "request_date");



ALTER TABLE ONLY "public"."consumption_requests"
    ADD CONSTRAINT "consumption_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications_raw"
    ADD CONSTRAINT "notifications_raw_notification_uuid_key" UNIQUE ("notification_uuid");



ALTER TABLE ONLY "public"."notifications_raw"
    ADD CONSTRAINT "notifications_raw_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_transaction_id_refund_date_key" UNIQUE ("transaction_id", "refund_date");



ALTER TABLE ONLY "public"."send_consumption_jobs"
    ADD CONSTRAINT "send_consumption_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_transaction_id_key" UNIQUE ("transaction_id");



ALTER TABLE ONLY "public"."usage_metrics"
    ADD CONSTRAINT "usage_metrics_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_consumption_jobs_scheduled" ON "public"."send_consumption_jobs" USING "btree" ("scheduled_at");



CREATE INDEX "idx_consumption_jobs_status" ON "public"."send_consumption_jobs" USING "btree" ("status");



CREATE INDEX "idx_consumption_requests_deadline" ON "public"."consumption_requests" USING "btree" ("deadline");



CREATE INDEX "idx_consumption_requests_environment" ON "public"."consumption_requests" USING "btree" ("environment");



CREATE INDEX "idx_consumption_requests_status" ON "public"."consumption_requests" USING "btree" ("status");



CREATE INDEX "idx_consumption_webhooks_environment" ON "public"."consumption_request_webhooks" USING "btree" ("environment");



CREATE INDEX "idx_consumption_webhooks_notification_uuid" ON "public"."consumption_request_webhooks" USING "btree" ("notification_uuid");



CREATE INDEX "idx_consumption_webhooks_original_transaction_id" ON "public"."consumption_request_webhooks" USING "btree" ("original_transaction_id");



CREATE INDEX "idx_consumption_webhooks_processing_status" ON "public"."consumption_request_webhooks" USING "btree" ("processing_status");



CREATE INDEX "idx_consumption_webhooks_received_at" ON "public"."consumption_request_webhooks" USING "btree" ("received_at");



CREATE INDEX "idx_consumption_webhooks_request_id" ON "public"."consumption_request_webhooks" USING "btree" ("request_id");



CREATE INDEX "idx_notifications_raw_notification_uuid" ON "public"."notifications_raw" USING "btree" ("notification_uuid");



CREATE INDEX "idx_notifications_raw_retry" ON "public"."notifications_raw" USING "btree" ("status", "retry_count") WHERE (("status")::"text" = 'failed'::"text");



CREATE INDEX "idx_notifications_raw_signed_date" ON "public"."notifications_raw" USING "btree" ("signed_date");



CREATE INDEX "idx_notifications_raw_source" ON "public"."notifications_raw" USING "btree" ("source");



CREATE INDEX "idx_notifications_raw_status" ON "public"."notifications_raw" USING "btree" ("status");



CREATE INDEX "idx_refunds_environment" ON "public"."refunds" USING "btree" ("environment");



CREATE INDEX "idx_refunds_transaction" ON "public"."refunds" USING "btree" ("original_transaction_id");



CREATE INDEX "idx_transactions_app_account" ON "public"."transactions" USING "btree" ("app_account_token");



CREATE INDEX "idx_transactions_environment" ON "public"."transactions" USING "btree" ("environment");



CREATE INDEX "idx_transactions_original_id" ON "public"."transactions" USING "btree" ("original_transaction_id");



CREATE INDEX "idx_usage_metrics_created" ON "public"."usage_metrics" USING "btree" ("created_at");



CREATE INDEX "idx_usage_metrics_token" ON "public"."usage_metrics" USING "btree" ("app_account_token");



CREATE OR REPLACE TRIGGER "set_admin_users_updated_at" BEFORE UPDATE ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_consumption_request_webhooks_updated_at" BEFORE UPDATE ON "public"."consumption_request_webhooks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."apple_api_logs"
    ADD CONSTRAINT "apple_api_logs_consumption_request_id_fkey" FOREIGN KEY ("consumption_request_id") REFERENCES "public"."consumption_requests"("id");



ALTER TABLE ONLY "public"."consumption_request_webhooks"
    ADD CONSTRAINT "consumption_request_webhooks_consumption_request_id_fkey" FOREIGN KEY ("consumption_request_id") REFERENCES "public"."consumption_requests"("id");



ALTER TABLE ONLY "public"."consumption_request_webhooks"
    ADD CONSTRAINT "consumption_request_webhooks_notification_raw_id_fkey" FOREIGN KEY ("notification_raw_id") REFERENCES "public"."notifications_raw"("id");



ALTER TABLE ONLY "public"."consumption_requests"
    ADD CONSTRAINT "consumption_requests_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications_raw"("id");



ALTER TABLE ONLY "public"."send_consumption_jobs"
    ADD CONSTRAINT "send_consumption_jobs_consumption_request_id_fkey" FOREIGN KEY ("consumption_request_id") REFERENCES "public"."consumption_requests"("id") ON DELETE CASCADE;



CREATE POLICY "Admin users can manage config" ON "public"."config" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "Admin users can manage consumption jobs" ON "public"."send_consumption_jobs" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "Admin users can manage consumption requests" ON "public"."consumption_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "Admin users can manage raw notifications" ON "public"."notifications_raw" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "Admin users can manage refunds" ON "public"."refunds" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "Admin users can manage transactions" ON "public"."transactions" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "Admin users can view api logs" ON "public"."apple_api_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "Admin users can view consumption webhooks" ON "public"."consumption_request_webhooks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "Admin users can view usage metrics" ON "public"."usage_metrics" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "Service role can insert notifications" ON "public"."notifications_raw" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can insert webhooks" ON "public"."consumption_request_webhooks" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage admin users" ON "public"."admin_users" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role full access to config" ON "public"."config" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Users can view own admin profile" ON "public"."admin_users" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apple_api_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consumption_request_webhooks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consumption_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications_raw" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."send_consumption_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_metrics" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_consumption_data"("p_original_transaction_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_consumption_data"("p_original_transaction_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_consumption_data"("p_original_transaction_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_data"("p_days_to_keep" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_data"("p_days_to_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_data"("p_days_to_keep" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."decode_jwt_payload"("jwt_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."decode_jwt_payload"("jwt_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decode_jwt_payload"("jwt_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_apple_private_key"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_apple_private_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_apple_private_key"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_consumption_metrics_summary"("p_environment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_consumption_metrics_summary"("p_environment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_consumption_metrics_summary"("p_environment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_lifetime_dollars_enum"("amount_in_cents" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_lifetime_dollars_enum"("amount_in_cents" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_lifetime_dollars_enum"("amount_in_cents" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_lifetime_dollars_enum"("amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_lifetime_dollars_enum"("amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_lifetime_dollars_enum"("amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_playtime_enum"("minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_playtime_enum"("minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_playtime_enum"("minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_consumption_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_consumption_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_consumption_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_pending_notifications_direct"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_pending_notifications_direct"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_pending_notifications_direct"() TO "service_role";



GRANT ALL ON FUNCTION "public"."store_apple_private_key"("p_private_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."store_apple_private_key"("p_private_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."store_apple_private_key"("p_private_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."apple_api_logs" TO "anon";
GRANT ALL ON TABLE "public"."apple_api_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_api_logs" TO "service_role";



GRANT ALL ON TABLE "public"."config" TO "anon";
GRANT ALL ON TABLE "public"."config" TO "authenticated";
GRANT ALL ON TABLE "public"."config" TO "service_role";



GRANT ALL ON TABLE "public"."consumption_request_webhooks" TO "anon";
GRANT ALL ON TABLE "public"."consumption_request_webhooks" TO "authenticated";
GRANT ALL ON TABLE "public"."consumption_request_webhooks" TO "service_role";



GRANT ALL ON TABLE "public"."consumption_requests" TO "anon";
GRANT ALL ON TABLE "public"."consumption_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."consumption_requests" TO "service_role";



GRANT ALL ON TABLE "public"."send_consumption_jobs" TO "anon";
GRANT ALL ON TABLE "public"."send_consumption_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."send_consumption_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."consumption_request_details" TO "anon";
GRANT ALL ON TABLE "public"."consumption_request_details" TO "authenticated";
GRANT ALL ON TABLE "public"."consumption_request_details" TO "service_role";



GRANT ALL ON TABLE "public"."cron_job_monitor" TO "anon";
GRANT ALL ON TABLE "public"."cron_job_monitor" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_job_monitor" TO "service_role";



GRANT ALL ON TABLE "public"."cron_job_status" TO "anon";
GRANT ALL ON TABLE "public"."cron_job_status" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_job_status" TO "service_role";



GRANT ALL ON TABLE "public"."notifications_raw" TO "anon";
GRANT ALL ON TABLE "public"."notifications_raw" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications_raw" TO "service_role";



GRANT ALL ON TABLE "public"."recent_cron_runs" TO "anon";
GRANT ALL ON TABLE "public"."recent_cron_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_cron_runs" TO "service_role";



GRANT ALL ON TABLE "public"."refunds" TO "anon";
GRANT ALL ON TABLE "public"."refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."refunds" TO "service_role";



GRANT ALL ON TABLE "public"."usage_metrics" TO "anon";
GRANT ALL ON TABLE "public"."usage_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_metrics" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






RESET ALL;
