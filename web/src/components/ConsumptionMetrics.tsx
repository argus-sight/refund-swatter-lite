'use client'

interface ConsumptionMetricsProps {
  stats: any
}

export default function ConsumptionMetrics({ stats }: ConsumptionMetricsProps) {
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
      value: stats.avg_response_time_ms ? `${stats.avg_response_time_ms}ms` : '-',
      color: 'text-purple-600'
    }
  ]

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Consumption Metrics (Last 30 Days)
        </h3>
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
  )
}