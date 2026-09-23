import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react'
import { ProductCategory } from '../types'

export interface CategoryBannerData {
  categoryId: string
  title: string
  subtitle: string
  image: string
  tag: string
}

export const CATEGORY_BANNERS: Record<string, CategoryBannerData> = {
  'INSTRUMENTAL Y ACCESORIOS': {
    categoryId: 'INSTRUMENTAL Y ACCESORIOS',
    title: 'Instrumental Quirúrgico y Rotatorio',
    subtitle:
      'Turbinas de titanio, contra-ángulos, fórceps, elevadores y micro-motores con precisión suiza para procedimientos de alta exigencia.',
    image: '/assets/cat-instrumental.jpg',
    tag: 'Titanio & Acero AISI 420'
  },
  OPERATORIA: {
    categoryId: 'OPERATORIA',
    title: 'Operatoria y Materiales Restauradores',
    subtitle:
      'Resinas nanohíbridas de alta estética, adhesivos universales, ionómeros y fotocuradores con máxima opalescencia natural.',
    image: '/assets/cat-operatoria-estetica.jpg',
    tag: 'Estética & Adhesión Clínica'
  },
  'DESECHABLES, ESTERILIZACION Y DESINFECCION': {
    categoryId: 'DESECHABLES, ESTERILIZACION Y DESINFECCION',
    title: 'Esterilización, Bioseguridad y Pabellón',
    subtitle:
      'Mangas de autoclave Tyvek, indicadores químicos multiparámetro, casetes quirúrgicos y guantes de nitrilo con certificación sanitaria.',
    image: '/assets/cat-esterilizacion-bioseguridad.jpg',
    tag: 'Control de Infecciones ISO'
  },
  ENDODONCIA: {
    categoryId: 'ENDODONCIA',
    title: 'Endodoncia y Diagnóstico Clínico',
    subtitle:
      'Limas NiTi rotatorias, localizadores apicales, conos de gutapercha y espejos de rodio con cero distorsión óptica.',
    image: '/assets/cat-diagnostico-endodoncia.jpg',
    tag: 'Precisión Microscópica'
  }
}

export interface CategoryShowcaseProps {
  selectedCategory: ProductCategory
  onSelectCategory: (category: ProductCategory) => void
}

export default function CategoryShowcase({ selectedCategory, onSelectCategory }: CategoryShowcaseProps) {
  // If a specific category is selected and has a banner, show the Contextual Category Banner
  if (selectedCategory !== 'all') {
    const banner = CATEGORY_BANNERS[selectedCategory]
    if (!banner) return null

    return (
      <div className="category-context-banner" role="region" aria-label={`Banner de ${banner.title}`}>
        <div className="category-context-body">
          <div className="category-context-pill">
            <CheckCircle2 size={13} />
            <span>{banner.tag}</span>
          </div>
          <h2 className="category-context-title">{banner.title}</h2>
          <p className="category-context-desc">{banner.subtitle}</p>
          <button type="button" className="category-context-reset-btn" onClick={() => onSelectCategory('all')}>
            <span>Ver todas las categorías</span>
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="category-context-media">
          <img src={banner.image} alt={banner.title} className="category-context-img" loading="lazy" />
        </div>
      </div>
    )
  }

  // When viewing "all", display the 4-card Category Showcase Hub
  const bannerList = Object.values(CATEGORY_BANNERS)

  return (
    <section className="category-showcase-hub" aria-label="Especialidades odontológicas destacadas">
      <div className="category-showcase-header">
        <div className="category-showcase-title-row">
          <Sparkles size={16} className="category-showcase-icon" />
          <h2 className="category-showcase-heading">Líneas Clínicas Especializadas</h2>
        </div>
        <span className="category-showcase-tagline">Fotografía de precisión y fichas técnicas homologadas</span>
      </div>

      <div className="category-showcase-grid">
        {bannerList.map((banner) => (
          <button
            key={banner.categoryId}
            type="button"
            className="category-showcase-card"
            onClick={() => onSelectCategory(banner.categoryId)}
            title={`Filtrar por ${banner.title}`}
          >
            <div className="category-card-media-wrap">
              <img src={banner.image} alt={banner.title} className="category-card-img" loading="lazy" />
              <span className="category-card-tag-pill">{banner.tag}</span>
            </div>
            <div className="category-card-info">
              <span className="category-card-title">{banner.title}</span>
              <p className="category-card-snippet">{banner.subtitle}</p>
              <div className="category-card-action">
                <span>Explorar insumos</span>
                <ArrowRight size={14} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
