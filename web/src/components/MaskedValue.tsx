'use client'

import { useState } from 'react'
import { maskSensitiveInfo, copyToClipboard } from '@/lib/utils'
import { 
  EyeIcon, 
  EyeSlashIcon, 
  DocumentDuplicateIcon,
  CheckIcon
} from '@heroicons/react/24/outline'

interface MaskedValueProps {
  label: string
  value: string | undefined | null
  maskByDefault?: boolean
  showCopy?: boolean
}

export default function MaskedValue({ 
  label, 
  value, 
  maskByDefault = true,
  showCopy = true 
}: MaskedValueProps) {
  const [isVisible, setIsVisible] = useState(!maskByDefault)
  const [copied, setCopied] = useState(false)
  
  const displayValue = value || ''
  const maskedValue = maskSensitiveInfo(displayValue)
  
  const handleCopy = async () => {
    if (!value) return
    
    try {
      await copyToClipboard(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }
  
  return (
    <div className="flex items-center justify-between group">
      <span className="text-sm text-gray-600">{label}:</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono">
          {isVisible ? displayValue : maskedValue}
        </span>
        
        {value && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Toggle visibility button */}
            <button
              onClick={() => setIsVisible(!isVisible)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title={isVisible ? 'Hide' : 'Show'}
            >
              {isVisible ? (
                <EyeSlashIcon className="h-4 w-4 text-gray-500" />
              ) : (
                <EyeIcon className="h-4 w-4 text-gray-500" />
              )}
            </button>
            
            {/* Copy button */}
            {showCopy && (
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Copy to clipboard"
              >
                {copied ? (
                  <CheckIcon className="h-4 w-4 text-green-500" />
                ) : (
                  <DocumentDuplicateIcon className="h-4 w-4 text-gray-500" />
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}