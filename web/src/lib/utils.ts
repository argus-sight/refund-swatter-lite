/**
 * Masks sensitive information, showing only a portion of the string
 * @param value - The string to mask
 * @param showStart - Number of characters to show at the start (default: 6)
 * @param showEnd - Number of characters to show at the end (default: 4)
 * @returns Masked string
 */
export function maskSensitiveInfo(value: string | undefined | null, showStart = 6, showEnd = 4): string {
  if (!value) return ''
  
  // For short strings, show less
  if (value.length <= 10) {
    showStart = 2
    showEnd = 2
  } else if (value.length <= 20) {
    showStart = 4
    showEnd = 3
  }
  
  // Don't mask if the string is too short
  if (value.length <= showStart + showEnd + 2) {
    return value
  }
  
  const start = value.substring(0, showStart)
  const end = value.substring(value.length - showEnd)
  const maskLength = Math.max(4, value.length - showStart - showEnd)
  const mask = '•'.repeat(Math.min(maskLength, 8))
  
  return `${start}${mask}${end}`
}

/**
 * Copies text to clipboard and returns a promise
 * @param text - The text to copy
 * @returns Promise that resolves when copied
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
  } else {
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    document.execCommand('copy')
    textArea.remove()
  }
}