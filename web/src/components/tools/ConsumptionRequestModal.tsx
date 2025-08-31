'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface ConsumptionRequestModalProps {
  request: any
  onClose: () => void
}

export default function ConsumptionRequestModal({ request, onClose }: ConsumptionRequestModalProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString()
  }

  const formatJSON = (data: any) => {
    if (!data) return 'No data'
    return JSON.stringify(data, null, 2)
  }

  const getConsumptionFieldLabel = (key: string): string => {
    const labels: Record<string, string> = {
      customerConsented: 'Customer Consented',
      consumptionStatus: 'Consumption Status',
      platform: 'Platform',
      sampleContentProvided: 'Sample Content Provided',
      deliveryStatus: 'Delivery Status',
      appAccountToken: 'App Account Token',
      lifetimeDollarsPurchased: 'Lifetime Dollars Purchased',
      lifetimeDollarsRefunded: 'Lifetime Dollars Refunded',
      userStatus: 'User Status',
      accountTenure: 'Account Tenure',
      playTime: 'Play Time',
      refundPreference: 'Refund Preference'
    }
    return labels[key] || key
  }

  const getConsumptionFieldValue = (key: string, value: any): string => {
    if (value === null || value === undefined) return 'Not set'
    
    switch (key) {
      case 'consumptionStatus':
        const consumptionStatuses = ['Undeclared', 'Not consumed', 'Partially consumed', 'Fully consumed']
        return `${value} - ${consumptionStatuses[value] || 'Unknown'}`
      
      case 'platform':
        const platforms = ['Undeclared', 'Apple', 'Non-Apple']
        return `${value} - ${platforms[value] || 'Unknown'}`
      
      case 'deliveryStatus':
        const deliveryStatuses = [
          'Delivered successfully',  // 0 - The app delivered the consumable and it's working properly
          'Quality issue',           // 1 - Not delivered due to quality issue
          'Wrong item',              // 2 - The app delivered the wrong item
          'Server outage',           // 3 - Not delivered due to server outage
          'Currency change',         // 4 - Not delivered due to in-game currency change
          'Other reasons'            // 5 - Not delivered for other reasons
        ]
        return `${value} - ${deliveryStatuses[value] || 'Unknown'}`
      
      case 'lifetimeDollarsPurchased':
      case 'lifetimeDollarsRefunded':
        const dollarRanges = [
          'Undeclared',
          '0 USD',
          '0.01-49.99 USD',
          '50-99.99 USD',
          '100-499.99 USD',
          '500-999.99 USD',
          '1000-1999.99 USD',
          'Over 2000 USD'
        ]
        return `${value} - ${dollarRanges[value] || 'Unknown'}`
      
      case 'userStatus':
        const userStatuses = ['Undeclared', 'Active', 'Suspended', 'Terminated', 'Limited access']
        return `${value} - ${userStatuses[value] || 'Unknown'}`
      
      case 'accountTenure':
        const tenureRanges = [
          'Undeclared',
          '0-3 days',
          '3-10 days',
          '10-30 days',
          '30-90 days',
          '90-180 days',
          '180-365 days',
          'Over 365 days'
        ]
        return `${value} - ${tenureRanges[value] || 'Unknown'}`
      
      case 'playTime':
        const playTimeRanges = [
          'Undeclared',
          '0-5 minutes',
          '5-60 minutes',
          '1-6 hours',
          '6-24 hours',
          '1-4 days',
          '4-16 days',
          'Over 16 days'
        ]
        return `${value} - ${playTimeRanges[value] || 'Unknown'}`
      
      case 'refundPreference':
        const refundPreferences = ['Undeclared', 'Grant', 'Decline', 'No preference']
        return `${value} - ${refundPreferences[value] || 'Unknown'}`
      
      case 'customerConsented':
      case 'sampleContentProvided':
        return value ? 'Yes' : 'No'
      
      case 'appAccountToken':
        return value || '(empty string)'
      
      default:
        return String(value)
    }
  }

  return (
    <Transition.Root show={true} as={Fragment}>
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl">
                <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                  <div className="flex items-start justify-between">
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                      Consumption Request Details
                    </Dialog.Title>
                    <button
                      type="button"
                      className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                      onClick={onClose}
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>

                  <div className="mt-6 space-y-6">
                    {/* Request Information */}
                    <div>
                      <h4 className="text-md font-medium text-gray-900 mb-3">Request Information</h4>
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Request ID</dt>
                          <dd className="mt-1 text-sm text-gray-900 font-mono">{request.request_id}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Status</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              request.request_status === 'sent' ? 'bg-green-100 text-green-800' :
                              request.request_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {request.request_status}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Request Date</dt>
                          <dd className="mt-1 text-sm text-gray-900">{formatDate(request.request_date)}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Deadline</dt>
                          <dd className="mt-1 text-sm text-gray-900">{formatDate(request.deadline)}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Original Transaction ID</dt>
                          <dd className="mt-1 text-sm text-gray-900 font-mono">{request.original_transaction_id}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Product ID</dt>
                          <dd className="mt-1 text-sm text-gray-900">{request.product_id || request.transaction_product_id || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Reason</dt>
                          <dd className="mt-1 text-sm text-gray-900">{request.consumption_request_reason || 'Not specified'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Environment</dt>
                          <dd className="mt-1 text-sm text-gray-900">{request.environment}</dd>
                        </div>
                      </dl>
                    </div>

                    {/* Consumption Data Sent to Apple */}
                    <div>
                      <h4 className="text-md font-medium text-gray-900 mb-3">Consumption Data Sent to Apple</h4>
                      {request.consumption_data ? (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <dl className="grid grid-cols-2 gap-4">
                            {Object.entries(request.consumption_data).map(([key, value]) => (
                              <div key={key}>
                                <dt className="text-sm font-medium text-gray-500">{getConsumptionFieldLabel(key)}</dt>
                                <dd className="mt-1 text-sm text-gray-900 font-mono">
                                  {getConsumptionFieldValue(key, value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No consumption data available</p>
                      )}
                    </div>

                    {/* Apple Response */}
                    <div>
                      <h4 className="text-md font-medium text-gray-900 mb-3">Apple Response</h4>
                      <dl className="space-y-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Response Status</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              request.apple_response_status.includes('Success') ? 'bg-green-100 text-green-800' :
                              request.apple_response_status.includes('Pending') ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {request.apple_response_status}
                            </span>
                          </dd>
                        </div>
                        {request.sent_at && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Sent At</dt>
                            <dd className="mt-1 text-sm text-gray-900">{formatDate(request.sent_at)}</dd>
                          </div>
                        )}
                        {request.response_time_ms && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Response Time</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {request.response_time_ms < 1000 
                                ? `${Math.round(request.response_time_ms)}ms`
                                : `${(request.response_time_ms / 1000).toFixed(1)}s`
                              }
                            </dd>
                          </div>
                        )}
                        {request.error_message && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Error Message</dt>
                            <dd className="mt-1 text-sm text-red-600 bg-red-50 p-2 rounded">
                              {request.error_message}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    {/* Raw Webhook Data (Collapsible) */}
                    {request.webhook_raw_body && (
                      <details className="border rounded-lg p-4">
                        <summary className="cursor-pointer text-md font-medium text-gray-900">
                          Raw Webhook Data
                        </summary>
                        <pre className="mt-3 text-xs text-gray-600 bg-gray-50 p-3 rounded overflow-x-auto">
                          {request.webhook_raw_body}
                        </pre>
                      </details>
                    )}

                    {/* Transaction Info (Collapsible) */}
                    {request.decoded_transaction_info && (
                      <details className="border rounded-lg p-4">
                        <summary className="cursor-pointer text-md font-medium text-gray-900">
                          Transaction Information
                        </summary>
                        <pre className="mt-3 text-xs text-gray-600 bg-gray-50 p-3 rounded overflow-x-auto">
                          {formatJSON(request.decoded_transaction_info)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
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