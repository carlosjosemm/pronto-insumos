import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react'
import { ProductCategory } from '../types'
import { CATEGORY_BANNERS } from './categoryBanners'

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
