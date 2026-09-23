import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Navbar from '../../components/Navbar'
import Hero from '../../components/Hero'
import ProductCard from '../../components/ProductCard'
import Footer from '../../components/Footer'
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
    it('should display the top utility bar announcements for Melipilla and SII Factura', () => {
      render(<Navbar search="" setSearch={() => {}} cartCount={2} onOpenCart={() => {}} />)
      expect(screen.getByText(/Despacho prioritario en Melipilla/i)).toBeInTheDocument()
      expect(screen.getByText(/Factura Electrónica Inmediata \(19% IVA\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Mesa Clínica: \+56 9 1234 5678/i)).toBeInTheDocument()
    })
  })

  describe('Hero Commercial Guarantee Card', () => {
    it('should render authentic B2B commercial guarantees instead of fake SaaS telemetry', () => {
      render(<Hero onExploreClick={() => {}} />)
      expect(screen.getByText('Garantías Comerciales B2B')).toBeInTheDocument()
      expect(screen.getByText(/Factura Electrónica Inmediata \(19% IVA\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Despacho Local y Retiro en Av\. Ortúzar/i)).toBeInTheDocument()
      expect(screen.getByText(/Insumos Certificados y Homologados/i)).toBeInTheDocument()
      expect(screen.getByText(/Mesa Técnica Directa WhatsApp/i)).toBeInTheDocument()
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
      expect(screen.getByText(/77\.892\.410-K/i)).toBeInTheDocument()
      expect(screen.getByText(/Av\. Ortúzar 750, Melipilla/i)).toBeInTheDocument()
      expect(screen.getByText(/Lunes a Viernes 08:30 – 18:30/i)).toBeInTheDocument()
    })

    it('must NEVER render the hazardous "🔥 Sembrar Firebase DB" seed button', () => {
      render(<Footer />)
      expect(screen.queryByText(/Sembrar Firebase/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/🔥/i)).not.toBeInTheDocument()
    })
  })
})
