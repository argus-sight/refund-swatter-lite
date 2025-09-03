'use client'

import { useState, useEffect } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import { supabase } from '@/lib/supabase'
import ConsumptionRequestModal from './ConsumptionRequestModal'

interface ConsumptionRequestHistoryProps {
  environment?: AppleEnvironment
}

interface ConsumptionRequest {
  request_id: string
  original_transaction_id: string
  consumption_request_reason: string | null
  request_date: string
  deadline: string
  request_status: string
  job_status: string | null
  apple_response_status: string
  environment: string
  product_id: string | null
  transaction_product_id: string | null
  price: number | null
  currency: string | null
  sent_at: string | null
  error_message: string | null
  consumption_data: any
  response_time_ms: number | null
}

export default function ConsumptionRequestHistory({ environment }: ConsumptionRequestHistoryProps) {
  const [requests, setRequests] = useState<ConsumptionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<ConsumptionRequest | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  // Removed resendingId state - no longer needed

  useEffect(() => {
    loadRequests()
  }, [statusFilter, environment])

  const loadRequests = async () => {
    try {
      setLoading(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No session available')
      }
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const params = new URLSearchParams({ limit: '100' })
      
      if (statusFilter !== 'all') {
        params.append('status', statusFilter)
      }
      
      // Always filter by the environment passed from Dashboard
      if (environment) {
        params.append('environment', environment)
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/consumption-requests?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch consumption requests')
      }

      const result = await response.json()
      setRequests(result.data || [])
      setError(null)
    } catch (err: any) {
      setError(err.message)
      setRequests([])
    } finally {
      setLoading(false)
    }
  }

  const handleRowClick = (request: ConsumptionRequest) => {
    setSelectedRequest(request)
    setShowModal(true)
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'sent': 'bg-green-100 text-green-800',
      'pending': 'bg-yellow-100 text-yellow-800',
      'failed': 'bg-red-100 text-red-800',
      'calculating': 'bg-blue-100 text-blue-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getResponseStatusBadge = (status: string) => {
    if (status.includes('Success')) {
      return 'bg-green-100 text-green-800'
    } else if (status.includes('Pending')) {
      return 'bg-yellow-100 text-yellow-800'
    } else if (status.includes('Failed') || status.includes('Error')) {
      return 'bg-red-100 text-red-800'
    }
    return 'bg-gray-100 text-gray-800'
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString()
  }

  const formatResponseTime = (ms: number | null) => {
    if (ms === null) return '-'
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex items-center space-x-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="all">All</option>
              <option value="sent">Sent</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          
          {/* Display current environment */}
          <div className="flex items-end">
            <div className="pb-2">
              <span className="text-sm font-medium text-gray-700 mr-2">Environment:</span>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                environment === AppleEnvironment.PRODUCTION 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {environment || 'All'}
              </span>
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={loadRequests}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Consumption Request History
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            View all consumption requests sent to Apple and their responses
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="text-gray-500">Loading consumption requests...</div>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="text-red-600">Error: {error}</div>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-500">No consumption requests found</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Request Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transaction ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Apple Response
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Response Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Environment
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requests.map((request) => (
                  <tr 
                    key={request.request_id} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleRowClick(request)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(request.request_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {request.original_transaction_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {request.product_id || request.transaction_product_id || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {request.consumption_request_reason || 'Not specified'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(request.request_status)}`}>
                        {request.request_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getResponseStatusBadge(request.apple_response_status)}`}>
                        {request.apple_response_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatResponseTime(request.response_time_ms)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        request.environment === AppleEnvironment.PRODUCTION 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {request.environment}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && selectedRequest && (
        <ConsumptionRequestModal
          request={selectedRequest}
          onClose={() => {
            setShowModal(false)
            setSelectedRequest(null)
          }}
        />
      )}
    </div>
  )
}