# Informe de Evaluación del Estado del Proyecto y Hoja de Ruta para Producción

**Proyecto:** PRONTO INSUMOS ODONTOLÓGICOS (Melipilla & RM, Chile)  
**Fecha:** 24 de Julio, 2026  
**Estado Actual:** Estable / Cobertura de Pruebas Completa (78/78 tests pasados) / Migrado a TypeScript 5.7+ / Preparado para Vercel Serverless

---

## 1. Resumen del Estado Actual del Proyecto

| Módulo | Estado | Detalles Técnicos |
| :--- | :--- | :--- |
| **Arquitectura & Código Base** | **100% Migrado a TypeScript** | Tipado estricto (`src/types/index.ts`), sin advertencias de compilación ni errores de compilador. |
| **Pruebas y Calidad** | **78 Tests Automatizados ✅** | Cobertura en Vitest + RTL para integridad de datos, servicios (WhatsApp, Mercado Pago, API) y componentes principales. |
| **Diseño Móvil & UX** | **Optimizado para Mobile & Desktop** | Grid responsivo, barra de búsqueda dedicada en móviles, Drawer de Carro deslizable y modal QuickView de insumos. |
| **Catálogo de Productos** | **Resiliente con Fallback** | Carga desde Firestore con fallback automático a catálogo local si las variables de entorno de Firebase aún no están configuradas. |
| **Flujos de Pago y Cotización** | **Diseñado (Checkout Pro & WhatsApp)** | Generación de mensaje de cotización formal para WhatsApp, simulación de pago directo y arquitectura serverless lista para Webhooks en Vercel. |

---

## 2. Brechas Técnicas para Producción (Production-Ready Gaps)

*(Excluyendo la carga de imágenes/activos en Firestore y el onboarding final de productos)*

### A. Cumplimiento Tributario y B2B Chile (RUT + Boleta / Factura Electrónica)
Para comerciar legalmente con clínicas dentales y odontólogos en Chile, el checkout debe diferenciar entre **Boleta** (persona natural) y **Factura Electrónica** (empresa/clínica).
- [ ] **Validación de RUT Chileno (Algoritmo Módulo 11):** Implementar la validación formal de RUT con dígito verificador tanto en cliente como servidor para evitar pedidos con datos inválidos.
- [ ] **Campos de Facturación B2B:** Cuando el cliente selecciona *"Necesito Factura"*, requerir obligatoriamente:
  - **Razón Social**
  - **RUT Empresa**
  - **Giro Comercial** (ej: *"Servicios Odontológicos / Clínica Dental"*)
  - **Dirección Tributaria y Comuna**

### B. Gateway Real de Mercado Pago (Checkout Pro via Preference API)
Actualmente el flujo simula una respuesta exitosa localmente. Para procesar pagos reales en producción:
- [ ] **Creación de Endpoint `/api/create-preference` (Serverless Function):**
  - Crear una función serverless en Vercel que reciba los ítems del carro y llame a la API oficial de Mercado Pago (`https://api.mercadopago.com/checkout/preferences`).
  - Retornar la `init_point` (o `sandbox_init_point`) para redirigir al usuario al entorno seguro de Mercado Pago Chile.
- [ ] **Carga de Credenciales de Producción:**
  - Configurar en Vercel: `MERCADOPAGO_ACCESS_TOKEN` (Production Access Token de Mercado Pago Chile) y `MERCADOPAGO_WEBHOOK_SECRET`.

### C. Sistema de Notificaciones Transaccionales (Email Automático)
Los clientes y la administración de la tienda necesitan confirmación inmediata por email.
- [ ] **Integración de Email API (Resend / SendGrid / Nodemailer):**
  - **Email al Cliente:** Resumen del pedido con N° de Orden (`PRONTO-XXXXXX`), detalle con IVA (19%), datos de la cuenta bancaria en caso de transferencia manual y enlace de soporte por WhatsApp.
  - **Email de Alerta a Ventas/Bodega:** Notificación en tiempo real cuando ingresa una venta aprobada o una solicitud de cotización para preparar el despacho en Melipilla/RM.

### D. Seguridad y Variables de Entorno en Servidor
- [ ] **Seguridad de Webhook Firestore:** Reemplazar el cliente web de Firestore en el webhook serverless por `firebase-admin` utilizando una Service Account cifrada en variables de entorno, evitando exponer reglas públicas de Firestore en la manipulación de estados de orden.

---

## 3. Mejoras para Elevar la Credibilidad, Confianza y Operatividad

### A. Credibilidad y Factores de Confianza (Trust & Credibility)
Las clínicas dentales realizan compras corporativas de alto valor. Para transmitir máxima profesionalidad:
- [ ] **Dominio Personalizado y SSL:** Migrar del subdominio de Vercel (`.vercel.app`) a un dominio `.cl` propio (ej: `prontoinsumos.cl` o `prontodental.cl`).
- [ ] **Identificación Comercial en el Footer:**
  - Agregar RUT de la empresa emisora, dirección física o de retiro en Melipilla, y horario de atención telefónica/WhatsApp.
- [ ] **Páginas Legales y de Políticas:**
  - **Términos y Condiciones / Ley del Consumidor N° 19.496:** Tiempos de garantía, cambios y devoluciones.
  - **Política de Insumos Regulados (ISP Chile):** Nota aclaratoria sobre productos que requieren título profesional o registro sanitario para su adquisición.
  - **Política de Envíos y Tiempos de Entrega:** Claridad en zonas de despacho (Melipilla urbano, zonas rurales y RM).

### B. SEO, OpenGraph y Marcado Estructurado (Google Search)
Actualmente `index.html` cuenta con la etiqueta de título básica.
- [ ] **Meta Etiquetas SEO y Social Sharing:**
  - Agregar `meta description` estratégica en español.
  - Configurar OpenGraph (`og:title`, `og:description`, `og:image`, `og:url`) para que los enlaces compartidos por WhatsApp o redes sociales muestren una vista previa profesional.
- [ ] **Schema.org (JSON-LD):**
  - Marcado `LocalBusiness` para Melipilla & RM y marcado `Product` / `Offer` para indexación enriquecida en Google Shopping y búsquedas orgánicas.

### C. Gestión Operativa y Panel de Administración (Backoffice)
- [ ] **Vista / Dashboard de Pedidos para Bodega:**
  - Una interfaz (protegida por autenticación Firebase Auth) donde el equipo de PRONTO pueda consultar pedidos recibidos, cambiar estados (*PENDIENTE_TRANSFERENCIA* ➔ *PAGADO* ➔ *EN_TRANSITO* ➔ *ENTREGADO*) y adjuntar el N° de seguimiento de transporte (Starken, Chilexpress o Transporte Propio).
- [ ] **Confirmación Manual de Comprobantes de Transferencia:**
  - Opción para cargar o adjuntar comprobantes de transferencia en el flujo de checkout y notificarlos directo al administrador.

### D. Disponibilidad, Telemetría y Manejo de Errores
- [ ] **Error Boundary en React:** Envolver la aplicación en un `ErrorBoundary` global con interfaz amigable para evitar pantallas blancas en caso de errores no controlados.
- [ ] **Monitoreo de Errores en Tiempo Real (Sentry / LogRocket):** Capturar fallos del lado del cliente antes de que los reporten los usuarios.

---

## 4. Hoja de Ruta Sugerida (Próximos Pasos)

1. **Validación de RUT e Integración de Formulario de Factura Electrónica (B2B)**.
2. **Creación del Endpoint Serverless `/api/create-preference` para Mercado Pago Real**.
3. **Servicio de Email Transaccional (Resend / SendGrid)**.
4. **Dominio .cl, SSL & SEO Meta Tags**.
5. **Panel Simple de Administración de Órdenes (Backoffice)**.
