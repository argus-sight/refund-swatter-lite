/**
 * Shared constants and enums for Supabase Edge Functions
 */

/**
 * Apple Environment values
 * Apple API may return these in different cases, so we normalize them
 */
export enum AppleEnvironment {
  SANDBOX = 'Sandbox',
  PRODUCTION = 'Production'
}

/**
 * Normalize environment string from Apple API to standard enum value
 * Handles various case formats that Apple might send
 */
export function normalizeEnvironment(env: string | undefined | null): AppleEnvironment {
  if (!env) {
    return AppleEnvironment.PRODUCTION; // Default to production if not specified
  }
  
  const normalized = env.toLowerCase().trim();
  
  if (normalized === 'sandbox') {
    return AppleEnvironment.SANDBOX;
  }
  
  return AppleEnvironment.PRODUCTION;
}

/**
 * Check if an environment string represents sandbox
 */
export function isSandboxEnvironment(env: string | undefined | null): boolean {
  return normalizeEnvironment(env) === AppleEnvironment.SANDBOX;
}

/**
 * Notification processing status
 */
export enum NotificationStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed'
}

/**
 * Notification source
 */
export enum NotificationSource {
  WEBHOOK = 'webhook',
  HISTORY_API = 'history_api'
}