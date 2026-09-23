/**
 * Contextual banner copy and photography for each dental specialty.
 *
 * Kept out of `CategoryShowcase.tsx` so that module only exports components —
 * mixing a data export into a component file breaks React Fast Refresh.
 */
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
