import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ConsumptionData {
  customerConsented: boolean
  consumptionStatus: number
  platform: number
  sampleContentProvided: boolean
  deliveryStatus: number
  appAccountToken: string
  lifetimeDollarsPurchased: number
  lifetimeDollarsRefunded: number
  userStatus: number
  accountTenure: number
  playTime: number
  refundPreference: number
}

/**
 * Calculate consumption data for a given transaction
 * @param originalTransactionId - The original transaction ID
 * @param environment - The environment (Production or Sandbox)
 * @param supabaseUrl - Supabase project URL
 * @param supabaseServiceKey - Supabase service role key
 * @returns Consumption data or null if not found
 */
export async function calculateConsumptionData(
  originalTransactionId: string,
  environment: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<ConsumptionData | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Get the latest transaction for this original_transaction_id
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('original_transaction_id', originalTransactionId)
      .eq('environment', environment)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // If no transaction found, create a basic consumption data with defaults
    if (txError || !transaction) {
      console.log(`No transaction found for ${originalTransactionId} in ${environment}, using defaults`)
      
      // Get refund preference from config table (get the first/latest config)
      const { data: config } = await supabase
        .from('config')
        .select('refund_preference')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      let refundPreference = 0 // Default to 0 - Undeclared
      if (config && config.refund_preference !== null) {
        refundPreference = config.refund_preference
      }

      return {
        customerConsented: true,
        consumptionStatus: 0, // 0 = Undeclared
        platform: 1, // 1 = Apple platform
        sampleContentProvided: true,
        deliveryStatus: 0, // 0 = Delivered successfully
        appAccountToken: '',
        lifetimeDollarsPurchased: 0, // 0 = Undeclared
        lifetimeDollarsRefunded: 0, // 0 = Undeclared
        userStatus: 0, // 0 = Undeclared (we don't track user status)
        accountTenure: 0, // 0 = Undeclared
        playTime: 0,
        refundPreference: refundPreference
      }
    }

    // Get app_account_token from the transaction
    const appAccountToken = transaction.app_account_token

    // Calculate play time and lifetime dollars for this user
    let playTime = 0
    let lifetimeDollarsRefunded = 0
    let lifetimeDollarsPurchased = 0

    // Track whether we successfully calculated the amounts
    let purchasedCalculated = false
    let refundedCalculated = false

    if (appAccountToken) {
      // Get all transactions for this user (by app_account_token) in the same environment
      const { data: userTransactions, error: userTxError } = await supabase
        .from('transactions')
        .select('price, original_transaction_id')
        .eq('app_account_token', appAccountToken)
        .eq('environment', environment)

      if (!userTxError && userTransactions) {
        // Successfully got transaction data, calculate purchases
        purchasedCalculated = true
        
        // All transactions in transactions table are purchases, so sum up all prices
        for (const tx of userTransactions) {
          lifetimeDollarsPurchased += Number(tx.price) || 0
        }

        // Get original_transaction_ids for this user from transactions table
        const userOriginalTxIds = userTransactions.map((tx: any) => tx.original_transaction_id)
        
        // Get refunds separately from refunds table, filtered by environment
        const { data: userRefunds, error: refundError } = await supabase
          .from('refunds')
          .select('refund_amount, original_transaction_id')
          .eq('environment', environment)
          .in('original_transaction_id', userOriginalTxIds)

        if (!refundError && userRefunds) {
          // Successfully got refund data, calculate refunds
          refundedCalculated = true
          
          for (const refund of userRefunds) {
            lifetimeDollarsRefunded += Number(refund.refund_amount) || 0
          }
        }
      }

      // Note: user_metrics table doesn't exist yet, so default playTime to 0
      playTime = 0
    }

    // Convert dollar amounts to Apple's enum values
    function getLifetimeDollarEnum(amount: number): number {
      // Handle invalid values (NaN, Infinity, etc.)
      if (!Number.isFinite(amount) || amount < 0) {
        return 0 // 0 = Undeclared for invalid values
      }
      
      if (amount === 0) return 1 // $0 USD
      if (amount < 50) return 2  // $0.01-49.99 USD
      if (amount < 100) return 3 // $50-99.99 USD
      if (amount < 500) return 4 // $100-499.99 USD
      if (amount < 1000) return 5 // $500-999.99 USD
      if (amount < 2000) return 6 // $1000-1999.99 USD
      return 7 // Over $2000 USD
    }

    // Get refund preference from config table (get the first/latest config)
    const { data: config, error: configError } = await supabase
      .from('config')
      .select('refund_preference')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    let refundPreference = 0 // Default to 0 - Undeclared
    if (!configError && config && config.refund_preference !== null) {
      refundPreference = config.refund_preference
    }

    // Build the consumption data object according to Apple's ConsumptionRequest format
    const consumptionData: ConsumptionData = {
      customerConsented: true,
      consumptionStatus: 0, // 0 = Undeclared (we don't track consumption status)
      platform: 1, // 1 = Apple platform
      sampleContentProvided: true, // Set to true as requested
      deliveryStatus: 0, // 0 = Delivered successfully (assume success if we have transaction data)
      appAccountToken: appAccountToken || '',
      lifetimeDollarsPurchased: purchasedCalculated ? getLifetimeDollarEnum(lifetimeDollarsPurchased) : 0,
      lifetimeDollarsRefunded: refundedCalculated ? getLifetimeDollarEnum(lifetimeDollarsRefunded) : 0,
      userStatus: 0, // 0 = Undeclared (we don't track user status)
      accountTenure: 0, // 0 = Undeclared (we don't track account age)
      playTime: Math.round(playTime),
      refundPreference: refundPreference
    }

    return consumptionData
  } catch (error) {
    console.error('Error calculating consumption data:', error)
    return null
  }
}