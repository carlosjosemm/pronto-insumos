import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Navbar from '../../components/Navbar'
import Hero from '../../components/Hero'
import ProductCard from '../../components/ProductCard'
import Footer from '../../components/Footer'
import { BANK_DETAILS } from '../../config/bankDetails'
import { Product } from '../../types'

const mockProduct: Product = {
  id: 'odon-test-500',
  name: 'Fotocurador Clínico LED Spectrum',
  category: 'Diagnostics',
  manufacturer: 'Woodpecker',
  price: 150.0,
  originalPrice: 190.0,
  rating: 4.9,
  reviewsCount: 38,
  inStock: true,
  stockCount: 12,
  prescriptionRequired: false,
  tag: 'Registro ISP',
  description: 'Unidad de fotocurado odontológico con amplio espectro de longitud de onda.',
  specs: ['3.000 mW/cm²', 'Batería de litio recargable'],
  placeholderTheme: 'gradient-blue',
  mediaBadge: 'LED 3000mW'
}

describe('Clinical Storefront UI/UX Enhancement Tests', () => {
  describe('Navbar & Top Commercial Utility Bar', () => {
    it('should announce the Melipilla + San Antonio zone and the Boleta document', () => {
      render(<Navbar search="" setSearch={() => {}} cartCount={2} onOpenCart={() => {}} />)
      expect(screen.getByText('Despacho a clínicas en Melipilla y San Antonio')).toBeInTheDocument()
      expect(screen.getByText('Boleta Electrónica · IVA 19%')).toBeInTheDocument()
      expect(screen.getByText(/Mesa Clínica: \+56 9 1234 5678/i)).toBeInTheDocument()
      // The retired pickup wording and Factura advertising must not come back
      expect(screen.queryByText(/Retiro en Av\. Ortúzar/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Factura Electrónica Inmediata/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/rutas RM/i)).not.toBeInTheDocument()
    })
  })

  describe('Hero Commercial Guarantee Card', () => {
    it('should render the final hero copy and the quiet inline trust row', () => {
      render(<Hero onExploreClick={() => {}} />)
      expect(screen.getByText('Depósito Dental · Melipilla')).toBeInTheDocument()
      expect(screen.getByText(/El depósito dental que despacha/i)).toBeInTheDocument()
      expect(screen.getByText('el mismo día')).toBeInTheDocument()
      expect(screen.getByText('Boleta Electrónica · IVA 19%')).toBeInTheDocument()
      expect(screen.getByText('Despacho el mismo día')).toBeInTheDocument()
      expect(screen.getByText('Para clínicas y laboratorios')).toBeInTheDocument()
      expect(screen.getByText('Mesa Técnica WhatsApp')).toBeInTheDocument()
      // The retired pill chrome and Factura advertising must not come back
      expect(screen.queryByText('Garantías Comerciales B2B')).not.toBeInTheDocument()
      expect(screen.queryByText('VALIDEZ SII')).not.toBeInTheDocument()
      expect(screen.queryByText(/Factura Electrónica Inmediata/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Retiro en Av\. Ortúzar/i)).not.toBeInTheDocument()
      // Unsubstantiated certification claims were replaced with neutral wording
      expect(screen.queryByText(/Insumos Certificados ISP/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Trazabilidad de lote/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Homologado/i)).not.toBeInTheDocument()
    })

    it('should render the hand-drawn underline motif on the hero keyword', () => {
      const { container } = render(<Hero onExploreClick={() => {}} />)
      expect(container.querySelector('.hero-title-underline')).toBeInTheDocument()
    })

    it('should call onExploreClick when "Explorar Catálogo de Insumos" is clicked', () => {
      const onExplore = vi.fn()
      render(<Hero onExploreClick={onExplore} />)
      fireEvent.click(screen.getByText('Explorar Catálogo de Insumos'))
      expect(onExplore).toHaveBeenCalledTimes(1)
    })
  })

  describe('ProductCard Clinical Specifications', () => {
    it('should render formatted technical SKU REF code and NOT expose internal warehouse stock counts', () => {
      render(<ProductCard product={mockProduct} onAddToCart={() => {}} onQuickView={() => {}} />)
      expect(screen.getByText('REF: OD-TEST-500')).toBeInTheDocument()
      expect(screen.queryByText(/Bodega Melipilla/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/12 en Bodega/i)).not.toBeInTheDocument()
    })

    it('should specify that the price includes IVA with simple wording', () => {
      render(<ProductCard product={mockProduct} onAddToCart={() => {}} onQuickView={() => {}} />)
      expect(screen.getByText(/IVA incluido/i)).toBeInTheDocument()
      expect(screen.queryByText(/Facturado/i)).not.toBeInTheDocument()
    })
  })

  describe('Footer B2B Grounding & Security', () => {
    it('should render the canonical brand lockup with the INSUMOS ODONTOLÓGICOS descriptor', () => {
      render(<Footer />)
      expect(screen.getByText('INSUMOS ODONTOLÓGICOS')).toBeInTheDocument()
      expect(screen.queryByText('PRONTO ODONTOLOGÍA')).not.toBeInTheDocument()
    })

    it('should render corporate tax identification, physical warehouse, and operating hours', () => {
      render(<Footer />)
      expect(screen.getByText(new RegExp(BANK_DETAILS.rut.replace(/\./g, '\\.')))).toBeInTheDocument()
      expect(screen.getByText(/Av\. Ortúzar 750, Melipilla/i)).toBeInTheDocument()
      expect(screen.getByText(/Lunes a Viernes 08:30 – 18:30/i)).toBeInTheDocument()
    })

    it('exposes legal policy buttons that open the LegalModal on the right section (Task 7.1)', () => {
      render(<Footer />)

      fireEvent.click(screen.getByRole('button', { name: 'Términos y Condiciones de Venta B2B' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Términos y Condiciones de Venta' })).toBeInTheDocument()
    })

    it('must never render dead href="#" placeholder links in the footer', () => {
      const { container } = render(<Footer />)
      expect(container.querySelectorAll('a[href="#"]')).toHaveLength(0)
      expect(container.querySelectorAll('a[href^="https://wa.me"]').length).toBeGreaterThan(0)
    })

    it('must NEVER render the hazardous "🔥 Sembrar Firebase DB" seed button', () => {
      render(<Footer />)
      expect(screen.queryByText(/Sembrar Firebase/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/🔥/i)).not.toBeInTheDocument()
    })

    it('states the delivery and invoicing facts without unsubstantiated certification claims', () => {
      render(<Footer />)

      expect(screen.getByText('Insumos odontológicos')).toBeInTheDocument()
      expect(screen.getByText('Para clínicas, gabinetes y laboratorios')).toBeInTheDocument()
      expect(screen.getByText(/Despacho sin costo en Melipilla y San Antonio/)).toBeInTheDocument()
      expect(screen.getByText('Boleta electrónica · IVA 19%')).toBeInTheDocument()
      expect(screen.getByText('Pago procesado por Mercado Pago Chile')).toBeInTheDocument()
      expect(screen.getByText('Insumos para clínicas y laboratorios dentales')).toBeInTheDocument()
      expect(screen.getByText('Depósito dental en Melipilla')).toBeInTheDocument()

      // The retired certification/registry claims must not return
      expect(screen.queryByText(/Registro ISP Chile/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Insumos Médicos Certificados/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Despacho Gratuito/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Dispositivos Homologados/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Fichas de Seguridad de Materiales/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Pago 100% Seguro/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Dispositivos Médicos/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Depósito Dental Certificado/i)).not.toBeInTheDocument()
    })
  })
})
