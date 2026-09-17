import { Category, Product, PromoCode } from '../types'

export const CATEGORIES: Category[] = [
  { id: 'all', name: 'Todos los Insumos', icon: 'Grid' },
  { id: 'Diagnostics', name: 'Diagnóstico y Exploración', icon: 'Activity' },
  { id: 'Instruments', name: 'Instrumental y Piezas de Mano', icon: 'Home' },
  { id: 'Materials', name: 'Materiales y Restauración', icon: 'Heart' },
  { id: 'Sterilization', name: 'Esterilización e Higiene', icon: 'ShieldAlert' }
]

export const PRODUCTS: Product[] = [
  {
    id: 'odon-101',
    name: 'Turbina Odontológica LED MasterTorque',
    category: 'Instruments',
    manufacturer: 'NSK',
    price: 189990,
    originalPrice: 229990,
    rating: 4.9,
    reviewsCount: 86,
    inStock: true,
    stockCount: 18,
    prescriptionRequired: false,
    tag: 'Más Vendido',
    description: 'Pieza de mano de alta velocidad con iluminación LED por fibra óptica, acople rápido push-button y triple spray de agua para gabinetes dentales.',
    specs: [
      'Velocidad de rotación: 380.000 a 420.000 RPM',
      'Iluminación LED natural por fibra óptica (25.000 Lux)',
      'Rodamientos de cerámica de alta durabilidad',
      'Conexión Midwest 4 vías autoclaveable a 135°C'
    ],
    placeholderTheme: 'gradient-teal',
    mediaBadge: 'Fibra Óptica LED',
    images: [],
    packageContents: [
      '1x Turbina de alta velocidad LED MasterTorque (Midwest 4 vías)',
      '1x Llave extractora y calibradora para cambio de rotor',
      '1x Mandril limpiador para ductos de irrigación triple',
      '1x Manual técnico y garantía de 6 meses'
    ]
  },
  {
    id: 'odon-102',
    name: 'Lámpara de Fotocurado Inalámbrica CuringPro 3000',
    category: 'Diagnostics',
    manufacturer: 'Woodpecker',
    price: 129500,
    originalPrice: 159000,
    rating: 4.8,
    reviewsCount: 112,
    inStock: true,
    stockCount: 22,
    prescriptionRequired: false,
    tag: 'Certificado ISP',
    description: 'Luz LED de polimerización para resinas compuestas de alta intensidad (3.000 mW/cm²) con espectro de amplia longitud de onda (385-515 nm).',
    specs: [
      'Potencia ajustable: 1.000 a 3.000 mW/cm²',
      'Tiempo de fotocurado ultrarrápido (1 a 3 segundos)',
      'Cabezal giratorio 360° de perfil bajo para posteriores',
      'Batería de litio con indicador de carga en pantalla'
    ],
    placeholderTheme: 'gradient-blue',
    mediaBadge: '3000 mW/cm²',
    images: [],
    packageContents: [
      '1x Lámpara de fotocurado inalámbrica CuringPro 3000',
      '1x Base de carga con conector de alimentación',
      '1x Fibra óptica conductora autoclaveable',
      '2x Protectores visuales de radiación ámbar'
    ]
  },
  {
    id: 'odon-103',
    name: 'Escariador Ultrasónico Dental OdonClean Pro',
    category: 'Instruments',
    manufacturer: 'DTE / Satelec',
    price: 245000,
    originalPrice: 295000,
    rating: 4.9,
    reviewsCount: 74,
    inStock: true,
    stockCount: 10,
    prescriptionRequired: false,
    tag: 'Recomendado Melipilla',
    description: 'Unidad de detartraje y profilaxis ultrasónica con pieza de mano desmontable autoclaveable, irrigación de agua integrada y puntas de titanio.',
    specs: [
      'Frecuencia piezoeléctrica automática: 28 kHz - 32 kHz',
      'Pieza de mano desmontable esterilizable a 135°C',
      'Incluye kit de 5 puntas clínicas (G1, G2, G4, P1)',
      'Pedal de control ergonómico manos libres'
    ],
    placeholderTheme: 'gradient-cyan',
    mediaBadge: 'Piezoeléctrico 32kHz',
    images: [],
    packageContents: [
      '1x Unidad principal de detartraje OdonClean Pro',
      '1x Pieza de mano ultrasónica desmontable',
      '5x Puntas de detartraje y profilaxis en titanio',
      '1x Llave de torque dinamométrica para puntas',
      '1x Pedal de accionamiento clínico'
    ]
  },
  {
    id: 'odon-104',
    name: 'Kit de Resinas Compuestas Nano-Híbridas DentFill',
    category: 'Materials',
    manufacturer: 'DentFill',
    price: 79990,
    originalPrice: 99000,
    rating: 4.7,
    reviewsCount: 145,
    inStock: true,
    stockCount: 35,
    prescriptionRequired: false,
    tag: 'Alta Estética',
    description: 'Set de 8 jeringas de resina estética fotocurable con tecnología de nano-relleno para restauraciones directas en sectores anteriores y posteriores.',
    specs: [
      '8 Jeringas de 4g en tonos A1, A2, A3, A3.5, B2, C2, Incisal y Denti',
      'Excelente pulido y retención de brillo a largo plazo',
      'Baja contracción de polimerización (<1.8%)',
      'Incluye ácido grabador 37% y adhesivo universal de 5ml'
    ],
    placeholderTheme: 'gradient-emerald',
    mediaBadge: 'Nano-Híbrido',
    images: [],
    packageContents: [
      '8x Jeringas de resina compuesta de 4g (A1, A2, A3, A3.5, B2, C2, Incisal, Denti)',
      '1x Frasco de adhesivo universal 5ml',
      '1x Jeringa de ácido ortofosfórico al 37% (3ml)',
      '10x Puntas aplicadoras desechables',
      '1x Guía de colorimetría clínica'
    ]
  },
  {
    id: 'odon-201',
    name: 'Autoclave Odontológico Clase B 18L SterilMax',
    category: 'Sterilization',
    manufacturer: 'SterilMax',
    price: 899000,
    originalPrice: 1100000,
    rating: 5.0,
    reviewsCount: 42,
    inStock: true,
    stockCount: 4,
    prescriptionRequired: false,
    tag: 'Normativa ISP',
    description: 'Esterilizador a vapor automático de vacío fraccionado previo y posterior para instrumentos quirúrgicos huecos y piezas de mano dentales.',
    specs: [
      'Capacidad de cámara: 18 Litros de acero inoxidable 304',
      'Bomba de vacío silenciosa de triple ciclo fraccionado',
      'Impresora térmica de ciclos integrada y puerto USB',
      'Cumple estrictamente normativa de esterilización ISP Chile'
    ],
    placeholderTheme: 'gradient-indigo',
    mediaBadge: 'Clase B Vacío',
    images: [],
    packageContents: [
      '1x Autoclave Clase B 18L SterilMax',
      '3x Bandejas de acero inoxidable para instrumental',
      '1x Pinza extractora de bandejas calientes',
      '1x Manguera de drenaje y cable de poder industrial',
      '1x Rollo de papel térmico para impresora de ciclos'
    ]
  },
  {
    id: 'odon-202',
    name: 'Alginato Cromático de Alta Precisión ImpressDent (500g)',
    category: 'Materials',
    manufacturer: 'ImpressDent',
    price: 18500,
    originalPrice: 24000,
    rating: 4.8,
    reviewsCount: 190,
    inStock: true,
    stockCount: 50,
    prescriptionRequired: false,
    tag: 'Uso Diario',
    description: 'Material de impresión dental libre de polvo con indicador cromático de fase (Violeta -> Rosa -> Blanco) para modelos de estudio y prótesis.',
    specs: [
      'Cambio de color visual guía para mezcla y fraguado',
      'Alta elasticidad y resistencia al desgarro',
      'Reproducción de detalles finos de hasta 20 micras',
      'Aroma fresco a menta para comodidad del paciente'
    ],
    placeholderTheme: 'gradient-slate',
    mediaBadge: 'Guía Cromática',
    images: [],
    packageContents: [
      '1x Bolsa sellada al vacío de 500g de alginato cromático',
      '1x Cuchara dosificadora de polvo milimetrada',
      '1x Probeta para medición precisa de agua'
    ]
  },
  {
    id: 'odon-301',
    name: 'Localizador de Ápice Digital ApexPro V',
    category: 'Diagnostics',
    manufacturer: 'Woodpecker',
    price: 165000,
    originalPrice: 199000,
    rating: 4.9,
    reviewsCount: 68,
    inStock: true,
    stockCount: 14,
    prescriptionRequired: false,
    tag: 'Endodoncia Avanzada',
    description: 'Buscador de ápice digital multifrecuencia para medición exacta de conductos radiculares en ambiente seco y húmedo.',
    specs: [
      'Pantalla LCD a color de 4.5 pulgadas con gráfica en tiempo real',
      'Precisión del 98.4% en conductos con sangre o irrigantes',
      'Alarma sonara progresiva según cercanía al constricción apical',
      'Accesorios autoclaveables (ganchos labiales y clips de lima)'
    ],
    placeholderTheme: 'gradient-emerald',
    mediaBadge: 'Precisión 98.4%',
    images: [],
    packageContents: [
      '1x Localizador de ápice digital ApexPro V',
      '1x Cable de prueba y conexión',
      '4x Ganchos labiales en acero inoxidable autoclaveables',
      '2x Clips portalimas de endodoncia',
      '1x Adaptador de corriente con batería recargable'
    ]
  },
  {
    id: 'odon-302',
    name: 'Set de Instrumental de Exploración Odontológica (10 pzas)',
    category: 'Instruments',
    manufacturer: 'Hu-Friedy',
    price: 42000,
    originalPrice: 55000,
    rating: 4.7,
    reviewsCount: 130,
    inStock: true,
    stockCount: 30,
    prescriptionRequired: false,
    tag: 'Acero Quirúrgico',
    description: 'Kit de diagnóstico oral de alta calidad en acero inoxidable alemán autoclaveable para exámenes de rutina en clínica.',
    specs: [
      'Incluye 2 espejos nº 5 con mango, 2 exploradores dobles, 2 pinzas de algodón y 2 sondas OMS',
      'Acero inoxidable quirúrgico grado 316L antirreflejo',
      'Ergonomía de agarre estriado para evitar fatiga',
      'Resistente a desinfección química y autoclave a 135°C'
    ],
    placeholderTheme: 'gradient-blue',
    mediaBadge: 'Acero Alemán 316L',
    images: [],
    packageContents: [
      '2x Espejos bucales planos nº 5 con mango ergonómico',
      '2x Exploradores dentales dobles nº 23/17',
      '2x Pinzas de curación porta-algodón con cierre',
      '2x Sondas periodontales tipo OMS con esfera calibrada',
      '1x Estuche metálico porta-instrumental esterilizable'
    ]
  },
  {
    id: 'odon-401',
    name: 'Campos Quirúrgicos Desechables Impermeables (Caja 100 un)',
    category: 'Sterilization',
    manufacturer: 'SteriTex',
    price: 32990,
    originalPrice: 42000,
    rating: 0,
    reviewsCount: 0,
    inStock: true,
    stockCount: 45,
    prescriptionRequired: false,
    tag: 'Nuevo Ingreso',
    description: 'Sabanillas clínicas de doble capa (papel absorbente + polietileno impermeable) para protección del sillón y paciente.',
    specs: [
      'Dimensiones: 33 cm x 45 cm (tamaño estándar pechera/campo)',
      'Excelente absorción de fluidos y barrera total contra humedad',
      'Textura gofrada para evitar deslizamiento de instrumentos',
      'Disponibles en azul clínico y verde quirúrgico'
    ],
    placeholderTheme: 'gradient-red',
    mediaBadge: 'Doble Capa Barredor',
    images: [],
    packageContents: [
      '1x Caja dispensadora con 100 campos impermeables 33x45cm'
    ]
  },
  {
    id: 'odon-402',
    name: 'Motor de Implante Odontológico ImplaDrive Pro',
    category: 'Instruments',
    manufacturer: 'W&H',
    price: 1250000,
    originalPrice: 1450000,
    rating: 5.0,
    reviewsCount: 25,
    inStock: true,
    stockCount: 3,
    prescriptionRequired: true,
    tag: 'Cirugía e Implantes',
    description: 'Consola quirúrgica para implantología y cirugía oral con pedal multifunción, contra-ángulo reductor 20:1 e irrigación salina.',
    specs: [
      'Torque máximo de 80 Ncm en contra-ángulo 20:1',
      '10 programas quirúrgicos personalizables',
      'Bomba peristáltica de irrigación de flujo variable y silencioso',
      'Pantalla táctil intuitiva con curva de torque en tiempo real'
    ],
    placeholderTheme: 'gradient-amber',
    mediaBadge: 'Torque 80 Ncm',
    images: [],
    packageContents: [
      '1x Consola principal quirúrgica ImplaDrive Pro con pantalla táctil',
      '1x Micromotor quirúrgico esterilizable en autoclave',
      '1x Contra-ángulo reductor 20:1 con luz LED',
      '1x Pedal multifuncional ergonómico',
      '1x Varilla soporte para suero fisiológico',
      '4x Tubos de irrigación descartables'
    ]
  },
  {
    id: 'odon-501',
    name: 'Anestésico Dental Lidocaína 2% con Epinefrina 1:100.000 (50 carpules)',
    category: 'Materials',
    manufacturer: 'Septodont',
    price: 38500,
    originalPrice: 46000,
    rating: 4.9,
    reviewsCount: 88,
    inStock: true,
    stockCount: 40,
    prescriptionRequired: true,
    tag: 'Venta Regulada ISP',
    description: 'Solución inyectable dental de anestesia local para procedimientos quirúrgicos y restauradores. Venta exclusiva bajo acreditación SIS o receta médica retenida.',
    specs: [
      'Registro Sanitario ISP Chile N° F-14220',
      '50 Cartuchos de vidrio de 1.8ml en blíster sellado',
      'Lidocaína Clorhidrato 2% + Epinefrina 1:100.000',
      'Embalaje clínico con control de trazabilidad y lote'
    ],
    placeholderTheme: 'gradient-teal',
    mediaBadge: 'Regulado ISP / SIS',
    images: [],
    packageContents: [
      '1x Caja dispensadora con 50 cartuchos de vidrio de 1.8ml',
      '1x Inserto técnico y posología clínica aprobada por ISP Chile'
    ]
  }
]

export const MOCK_PROMOS: Record<string, PromoCode> = {
  'PRONTO10': { discountPercent: 10, code: 'PRONTO10', label: '10% Descuento Primer Pedido Odontológico' },
  'DENT20': { discountPercent: 20, code: 'DENT20', label: '20% Convenio Clínicas Melipilla' }
}
