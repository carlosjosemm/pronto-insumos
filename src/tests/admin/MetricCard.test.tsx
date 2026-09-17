import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricCard } from '../../admin/components/MetricCard'
import { DollarSign } from 'lucide-react'

describe('Admin MetricCard Component', () => {
  it('renders label, value and subtitle correctly', () => {
    render(
      <MetricCard
        label="Ventas Hoy"
        value="$1.250.000"
        subtitle="Confirmadas"
        icon={<DollarSign data-testid="dollar-icon" />}
      />
    )

    expect(screen.getByText('Ventas Hoy')).toBeInTheDocument()
    expect(screen.getByText('$1.250.000')).toBeInTheDocument()
    expect(screen.getByText('Confirmadas')).toBeInTheDocument()
    expect(screen.getByTestId('dollar-icon')).toBeInTheDocument()
  })
})
