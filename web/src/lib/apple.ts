export enum AppleEnvironment {
  PRODUCTION = 'production',
  SANDBOX = 'sandbox'
}

export const APPLE_API_BASE_PRODUCTION = 'https://api.storekit.itunes.apple.com/inApps/v1'
export const APPLE_API_BASE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'

export function getAppleApiBase(environment: AppleEnvironment): string {
  return environment === AppleEnvironment.SANDBOX 
    ? APPLE_API_BASE_SANDBOX 
    : APPLE_API_BASE_PRODUCTION
}

export interface AppleNotification {
  notificationType: string
  subtype?: string
  notificationUUID: string
  data?: {
    environment?: string
    transactionInfo?: any
    consumptionRequestReason?: string
  }
}

export interface ConsumptionData {
  accountTenure: number
  appAccountToken: string
  consumptionStatus: number
  customerConsented: boolean
  deliveryStatus: number
  lifetimeDollarsPurchased: number
  lifetimeDollarsRefunded: number
  platform: number
  playTime: number
  refundPreference: number
  sampleContentProvided: boolean
  userStatus: number
}