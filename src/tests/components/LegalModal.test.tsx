import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import LegalModal, { LegalSection } from '../../components/LegalModal'
import { BANK_DETAILS } from '../../config/bankDetails'

const onClose = vi.fn()

const renderModal = (section: LegalSection) => render(<LegalModal section={section} onClose={onClose} />)

describe('LegalModal (Task 7.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the dialog with the Terms of Sale section', () => {
    renderModal('terminos')

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Términos y Condiciones de Venta' })).toBeInTheDocument()
    expect(screen.getByText(/Boleta Electrónica/i)).toBeInTheDocument()
    expect(screen.getByText(/Mercado Pago Chile/i)).toBeInTheDocument()
  })

  it('renders the SERNAC 6-month warranty section with the legal marker', () => {
    renderModal('garantia')

    expect(screen.getByRole('heading', { name: /Garantía Legal de 6 Meses/ })).toBeInTheDocument()
    expect(screen.getByText(/Ley N° 19\.496/)).toBeInTheDocument()
  })

  it('renders the privacy section with the Ley 19.628 marker', () => {
    renderModal('privacidad')

    expect(screen.getByText(/Ley N° 19\.628/)).toBeInTheDocument()
    expect(screen.getByText(/Nunca almacenamos datos de tarjetas/i)).toBeInTheDocument()
  })

  it('renders the company legal identification from config, never literals', () => {
    renderModal('identificacion')

    expect(screen.getByText(BANK_DETAILS.companyName)).toBeInTheDocument()
    expect(screen.getByText(BANK_DETAILS.rut)).toBeInTheDocument()
    expect(screen.getByText(/Av\. Ortúzar 750, Melipilla, Chile/)).toBeInTheDocument()
    expect(screen.getByText(BANK_DETAILS.email)).toBeInTheDocument()
  })

  it('switches sections through the nav buttons', () => {
    renderModal('terminos')

    fireEvent.click(screen.getByRole('button', { name: /Privacidad/ }))
    expect(screen.getByText(/Ley N° 19\.628/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Garantía Legal/ }))
    expect(screen.getByText(/Ley N° 19\.496/)).toBeInTheDocument()
  })

  it('closes on Escape and on overlay click', () => {
    renderModal('terminos')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
