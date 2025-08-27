/**
 * Logger utility for API routes
 */

export class ApiLogger {
  private requestId: string
  private startTime: number
  private route: string

  constructor(route: string, requestId?: string) {
    this.requestId = requestId || crypto.randomUUID()
    this.startTime = Date.now()
    this.route = route
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    const duration = Date.now() - this.startTime
    
    let logMessage = `[${timestamp}] [${level}] [${this.requestId}] [${this.route}] [${duration}ms] ${message}`
    
    if (data) {
      logMessage += ` | Data: ${JSON.stringify(data, null, 2)}`
    }
    
    return logMessage
  }

  log(message: string, data?: any) {
    console.log(this.formatMessage('INFO', message, data))
  }

  error(message: string, error?: any) {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error
    
    console.error(this.formatMessage('ERROR', message, errorData))
  }

  warn(message: string, data?: any) {
    console.warn(this.formatMessage('WARN', message, data))
  }

  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatMessage('DEBUG', message, data))
    }
  }

  success(message: string, data?: any) {
    console.log(this.formatMessage('SUCCESS', `✓ ${message}`, data))
  }

  getRequestId(): string {
    return this.requestId
  }

  getDuration(): number {
    return Date.now() - this.startTime
  }
}

// Utility function to log API route requests
export function logApiRequest(req: Request, route: string): ApiLogger {
  const logger = new ApiLogger(route)
  
  logger.log('==> Request Started', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
    userAgent: req.headers.get('user-agent'),
    referer: req.headers.get('referer')
  })
  
  return logger
}

// Utility function to log API route responses
export function logApiResponse(logger: ApiLogger, status: number, data?: any) {
  const duration = logger.getDuration()
  
  if (status >= 200 && status < 300) {
    logger.success(`Request completed`, {
      status,
      duration: `${duration}ms`,
      responseData: data
    })
  } else if (status >= 400 && status < 500) {
    logger.warn(`Client error response`, {
      status,
      duration: `${duration}ms`,
      responseData: data
    })
  } else if (status >= 500) {
    logger.error(`Server error response`, {
      status,
      duration: `${duration}ms`,
      responseData: data
    })
  }
}