'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'

interface NotificationDetailModalProps {
  notification: any
  isOpen: boolean
  onClose: () => void
}

export default function NotificationDetailModal({ notification, isOpen, onClose }: NotificationDetailModalProps) {
  if (!notification) return null

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return format(new Date(date), 'MMM dd, yyyy HH:mm:ss')
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      processed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      failed_permanent: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  // Decode signedTransactionInfo JWT if present
  const decodeSignedTransactionInfo = () => {
    try {
      const signedTransactionInfo = notification.decoded_payload?.data?.signedTransactionInfo
      if (!signedTransactionInfo) return null
      
      // JWT has 3 parts: header.payload.signature
      const parts = signedTransactionInfo.split('.')
      if (parts.length !== 3) return null
      
      // Decode the payload (middle part)
      const payload = JSON.parse(atob(parts[1]))
      return payload
    } catch (error) {
      console.error('Failed to decode signedTransactionInfo:', error)
      return null
    }
  }

  // Decode signedRenewalInfo JWT if present  
  const decodeSignedRenewalInfo = () => {
    try {
      const signedRenewalInfo = notification.decoded_payload?.data?.signedRenewalInfo
      if (!signedRenewalInfo) return null
      
      const parts = signedRenewalInfo.split('.')
      if (parts.length !== 3) return null
      
      const payload = JSON.parse(atob(parts[1]))
      return payload
    } catch (error) {
      console.error('Failed to decode signedRenewalInfo:', error)
      return null
    }
  }

  const decodedTransactionInfo = decodeSignedTransactionInfo()
  const decodedRenewalInfo = decodeSignedRenewalInfo()

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl">
                <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                  <div className="flex items-start justify-between">
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                      Notification Details
                    </Dialog.Title>
                    <button
                      type="button"
                      className="rounded-md bg-white text-gray-400 hover:text-gray-500"
                      onClick={onClose}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-6 space-y-6">
                    {/* Basic Information */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-4">Basic Information</h4>
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Type</dt>
                          <dd className="mt-1 text-sm text-gray-900">{notification.notification_type}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Subtype</dt>
                          <dd className="mt-1 text-sm text-gray-900">{notification.subtype || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">UUID</dt>
                          <dd className="mt-1 text-sm text-gray-900 font-mono break-all">{notification.notification_uuid}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Environment</dt>
                          <dd className="mt-1 text-sm text-gray-900">{notification.environment}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Status</dt>
                          <dd className="mt-1">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(notification.status)}`}>
                              {notification.status}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Source</dt>
                          <dd className="mt-1 text-sm text-gray-900">{notification.source || 'webhook'}</dd>
                        </div>
                      </dl>
                    </div>

                    {/* Time Information */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-4">Time Information</h4>
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Apple Signed Date</dt>
                          <dd className="mt-1 text-sm text-gray-900">{formatDate(notification.signed_date)}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Received At</dt>
                          <dd className="mt-1 text-sm text-gray-900">{formatDate(notification.received_at)}</dd>
                        </div>
                        {notification.processed_at && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Processed At</dt>
                            <dd className="mt-1 text-sm text-gray-900">{formatDate(notification.processed_at)}</dd>
                          </div>
                        )}
                        {notification.created_at && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Created At</dt>
                            <dd className="mt-1 text-sm text-gray-900">{formatDate(notification.created_at)}</dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    {/* Retry Information */}
                    {(notification.retry_count > 0 || notification.last_retry_at) && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-4">Retry Information</h4>
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Retry Count</dt>
                            <dd className="mt-1 text-sm text-gray-900">{notification.retry_count || 0}</dd>
                          </div>
                          {notification.last_retry_at && (
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Last Retry At</dt>
                              <dd className="mt-1 text-sm text-gray-900">{formatDate(notification.last_retry_at)}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}

                    {/* Decoded Transaction Information */}
                    {decodedTransactionInfo && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-4">Transaction Information</h4>
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Transaction ID</dt>
                            <dd className="mt-1 text-sm text-gray-900 font-mono">
                              {decodedTransactionInfo.transactionId || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Original Transaction ID</dt>
                            <dd className="mt-1 text-sm text-gray-900 font-mono">
                              {decodedTransactionInfo.originalTransactionId || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Product ID</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {decodedTransactionInfo.productId || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Bundle ID</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {decodedTransactionInfo.bundleId || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Purchase Date</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {decodedTransactionInfo.purchaseDate 
                                ? format(new Date(decodedTransactionInfo.purchaseDate), 'MMM dd, yyyy HH:mm:ss')
                                : '-'
                              }
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Original Purchase Date</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {decodedTransactionInfo.originalPurchaseDate 
                                ? format(new Date(decodedTransactionInfo.originalPurchaseDate), 'MMM dd, yyyy HH:mm:ss')
                                : '-'
                              }
                            </dd>
                          </div>
                          {decodedTransactionInfo.expiresDate && (
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Expires Date</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {format(new Date(decodedTransactionInfo.expiresDate), 'MMM dd, yyyy HH:mm:ss')}
                              </dd>
                            </div>
                          )}
                          {decodedTransactionInfo.revocationDate && (
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Revocation Date</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {format(new Date(decodedTransactionInfo.revocationDate), 'MMM dd, yyyy HH:mm:ss')}
                              </dd>
                            </div>
                          )}
                          {decodedTransactionInfo.revocationReason !== undefined && (
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Revocation Reason</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {decodedTransactionInfo.revocationReason === 0 ? 'App issue' : 'Other reason'}
                              </dd>
                            </div>
                          )}
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Type</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {decodedTransactionInfo.type || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">In App Ownership Type</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {decodedTransactionInfo.inAppOwnershipType || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Environment</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {decodedTransactionInfo.environment || '-'}
                            </dd>
                          </div>
                          {decodedTransactionInfo.price !== undefined && (
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Price</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {decodedTransactionInfo.price / 1000} {decodedTransactionInfo.currency || ''}
                              </dd>
                            </div>
                          )}
                          {decodedTransactionInfo.storefront && (
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Storefront</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {decodedTransactionInfo.storefront}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}

                    {/* Decoded Renewal Information */}
                    {decodedRenewalInfo && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-4">Renewal Information</h4>
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Auto Renew Product ID</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {decodedRenewalInfo.autoRenewProductId || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Auto Renew Status</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {decodedRenewalInfo.autoRenewStatus === 1 ? 'Active' : 'Inactive'}
                            </dd>
                          </div>
                          {decodedRenewalInfo.expirationIntent !== undefined && (
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Expiration Intent</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {decodedRenewalInfo.expirationIntent}
                              </dd>
                            </div>
                          )}
                          {decodedRenewalInfo.gracePeriodExpiresDate && (
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Grace Period Expires</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {format(new Date(decodedRenewalInfo.gracePeriodExpiresDate), 'MMM dd, yyyy HH:mm:ss')}
                              </dd>
                            </div>
                          )}
                          {decodedRenewalInfo.priceIncreaseStatus !== undefined && (
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Price Increase Status</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {decodedRenewalInfo.priceIncreaseStatus === 1 ? 'Customer consented' : 'Customer has not responded'}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}

                    {/* Raw Decoded Payload */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-4">Raw Decoded Payload</h4>
                      <div className="bg-gray-50 rounded-lg p-4 overflow-auto max-h-96">
                        <pre className="text-xs text-gray-800">
                          {JSON.stringify(notification.decoded_payload, null, 2)}
                        </pre>
                      </div>
                    </div>

                    {/* Decoded Transaction Info JSON */}
                    {decodedTransactionInfo && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-4">Decoded Transaction Info (JSON)</h4>
                        <div className="bg-gray-50 rounded-lg p-4 overflow-auto max-h-96">
                          <pre className="text-xs text-gray-800">
                            {JSON.stringify(decodedTransactionInfo, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Decoded Renewal Info JSON */}
                    {decodedRenewalInfo && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-4">Decoded Renewal Info (JSON)</h4>
                        <div className="bg-gray-50 rounded-lg p-4 overflow-auto max-h-96">
                          <pre className="text-xs text-gray-800">
                            {JSON.stringify(decodedRenewalInfo, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:ml-3 sm:w-auto"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}