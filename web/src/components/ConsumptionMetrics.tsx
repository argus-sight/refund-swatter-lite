'use client'

interface ConsumptionMetricsProps {
  stats: any
  environment?: string
}

export default function ConsumptionMetrics({ stats, environment }: ConsumptionMetricsProps) {
  if (!stats) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Consumption Metrics</h2>
        <div className="text-center text-gray-500">Loading metrics...</div>
      </div>
    )
  }

  const metrics = [
    {
      label: 'Total Requests',
      value: stats.total_requests || 0,
      color: 'text-gray-900'
    },
    {
      label: 'Sent Successfully',
      value: stats.sent_successfully || 0,
      color: 'text-green-600'
    },
    {
      label: 'Failed',
      value: stats.failed_requests || 0,
      color: 'text-red-600'
    },
    {
      label: 'Pending',
      value: stats.pending_requests || 0,
      color: 'text-yellow-600'
    },
    {
      label: 'Success Rate',
      value: `${stats.success_rate || 0}%`,
      color: 'text-blue-600'
    },
    {
      label: 'Avg Response Time',
      value: stats.avg_response_time_ms ? `${(stats.avg_response_time_ms / 1000).toFixed(2)}s` : '-',
      color: 'text-purple-600'
    }
  ]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Consumption Metrics (Last 30 Days)
            </h3>
            {environment && (
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                environment === 'Production' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {environment}
              </span>
            )}
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {metrics.map((metric, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">{metric.label}</p>
                <p className={`text-2xl font-semibold mt-1 ${metric.color}`}>
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Important Notice about Consumption Data */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-amber-900 mb-2">⚠️ Important: Consumption Data Defaults</h3>
        <div className="text-xs text-amber-800 space-y-1">
          <p>
            <strong>Consumption Status:</strong> Defaults to 0 (Undeclared) when usage data is not available. 
            Apple notifications don't track content consumption - you need to implement this in your app.
          </p>
          <p>
            <strong>User Status:</strong> Defaults to 0 (Undeclared) or 1 (Active). 
            To report suspended/terminated accounts, implement account management in your app.
          </p>
          <p>
            <strong>Delivery Status:</strong> Always reports 0 (Successfully delivered). 
            Ensure successful delivery before sending consumption data.
          </p>
          <p className="pt-2 text-amber-900">
            See Settings tab for detailed information about each field.
          </p>
        </div>
      </div>
    </div>
  )
}