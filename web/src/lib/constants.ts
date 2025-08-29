/**
 * Shared constants for the web application
 */

/**
 * Apple Environment values
 * Normalized values used throughout the application
 */
export enum AppleEnvironment {
  SANDBOX = 'Sandbox',
  PRODUCTION = 'Production'
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