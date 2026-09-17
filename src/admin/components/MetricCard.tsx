import React from 'react'

interface MetricCardProps {
  label: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  accentColor?: string
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  accentColor = 'var(--teal-600)'
}) => {
  return (
    <div className="admin-metric-card">
      <div className="admin-metric-card-top">
        <span className="admin-metric-label">{label}</span>
        <div className="admin-metric-icon" style={{ color: accentColor }}>
          {icon}
        </div>
      </div>
      <div className="admin-metric-value" style={{ color: accentColor === 'var(--danger)' ? 'var(--danger)' : undefined }}>
        {value}
      </div>
      {subtitle && <div className="admin-metric-subtitle">{subtitle}</div>}
    </div>
  )
}
