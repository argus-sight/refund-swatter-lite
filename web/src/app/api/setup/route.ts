import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { ApiLogger, logApiRequest, logApiResponse } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const logger = logApiRequest(request, 'POST /api/setup')
  
  try {
    logger.log('Parsing request body...')
    const { privateKey } = await request.json()
    
    if (!privateKey) {
      logger.warn('Missing required field: privateKey')
      const response = NextResponse.json(
        { error: 'Private key is required' },
        { status: 400 }
      )
      logApiResponse(logger, 400, { error: 'Private key is required' })
      return response
    }
    
    logger.log('Private key received', {
      keyLength: privateKey.length,
      keyPreview: privateKey.substring(0, 50) + '...'
    })

    logger.log('Initializing Supabase service client...')
    const supabase = await getServiceSupabase()
    logger.success('Supabase client initialized')
    
    // Store private key using the vault function
    logger.log('Storing private key in database...')
    const { data, error } = await supabase
      .rpc('store_apple_private_key', {
        p_private_key: privateKey
      })

    if (error) {
      logger.error('Failed to store private key', error)
      const response = NextResponse.json(
        { error: 'Failed to store private key', details: error.message },
        { status: 500 }
      )
      logApiResponse(logger, 500, { error: 'Failed to store private key', details: error.message })
      return response
    }

    logger.success('Private key stored successfully', { secretId: data })
    
    const responseData = { 
      success: true,
      secretId: data,
      requestId: logger.getRequestId()
    }
    
    const response = NextResponse.json(responseData)
    logApiResponse(logger, 200, responseData)
    return response

  } catch (error) {
    logger.error('Unexpected error in setup endpoint', error)
    const responseData = { 
      error: 'Setup failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestId: logger.getRequestId()
    }
    
    const response = NextResponse.json(responseData, { status: 500 })
    logApiResponse(logger, 500, responseData)
    return response
  }
}