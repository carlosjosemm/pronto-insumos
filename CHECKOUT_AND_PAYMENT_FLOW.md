# PRONTO — Flujo de Checkout y Post-Pago (tal como está implementado)

Referencia de extremo a extremo del ciclo de vida del pedido en la tienda: el checkout de 5 pasos,
las tres vías de pago, la autoridad de pago del lado servidor, el flujo del comprobante de
transferencia y el traspaso a despacho.

> Este es el **único documento del repositorio redactado en español** (decisión del owner,
> 2026-09-29). Los identificadores de código, rutas de archivo, nombres de estado, endpoints y
> variables de entorno se mantienen en su forma literal.

**Cómo leerlo:** los diagramas describen el comportamiento **tal como está implementado** en el
commit `f599694` (estado con la Task 2.12 integrada). Cada flecha está respaldada por los archivos
listados en la §5 — si el código y este documento se contradicen, manda el código y el error está
aquí.

**Tema de los diagramas:** cada diagrama abre con una directiva `init` de mermaid que pinta un
**panel azul marino oscuro autocontenido** (`#0b1a33`, el `--ink-900` de la tienda) con texto claro,
para que se lea igual en GitHub claro/oscuro y en una vista previa de IDE oscura, en lugar de
heredar el fondo del anfitrión. La paleta replica los tokens de la tienda: nodos azul marino
(`#102748`), bordes cian (`#67e8f9`) y conectores gris pizarra (`#7c8a9a`). Mantén los diagramas
nuevos con la misma directiva; la regla de fondo está acotada con `svg[aria-roledescription]`, que
solo puede coincidir con el SVG raíz de un diagrama mermaid. Evita `;` dentro de las etiquetas —
mermaid lo interpreta como separador de sentencias y el diagrama no compila.

**Las dos reglas de hierro que codifican los diagramas** (raíz [AGENTS.md](./AGENTS.md) §4):

1. **El navegador nunca aprueba un pago ni toca el stock.** Los pedidos se crean en `PENDIENTE_*`;
   solo una vía verificada del servidor puede fijar `PAGADO_MERCADOPAGO` o descontar `stockCount`.
2. **Una URL nunca es prueba de pago.** El retorno de Mercado Pago (`?status=approved&orderId=…`)
   es falsificable y llega *antes* de que el webhook haya verificado nada, así que solo alimenta
   mensajes honestos y un atajo de seguimiento (Task 2.12).

---

## 1. Flujo de extremo a extremo

```mermaid
%%{init: {"theme": "base", "themeCSS": "svg[aria-roledescription]{background:#0b1a33}", "themeVariables": {"background": "#0b1a33", "primaryColor": "#102748", "primaryTextColor": "#e6f4f7", "primaryBorderColor": "#67e8f9", "secondaryColor": "#1a3a6a", "secondaryTextColor": "#e6f4f7", "secondaryBorderColor": "#67e8f9", "tertiaryColor": "#0f1e33", "tertiaryTextColor": "#e6f4f7", "tertiaryBorderColor": "#2a4a7f", "lineColor": "#7c8a9a", "textColor": "#e6f4f7", "titleColor": "#e6f4f7", "edgeLabelBackground": "#102748", "clusterBkg": "#0f1e33", "clusterBorder": "#2a4a7f", "fontFamily": "Inter, system-ui, sans-serif", "actorBkg": "#102748", "actorBorder": "#67e8f9", "actorTextColor": "#e6f4f7", "actorLineColor": "#7c8a9a", "signalColor": "#c9d2db", "signalTextColor": "#e6f4f7", "labelBoxBkgColor": "#102748", "labelBoxBorderColor": "#67e8f9", "labelTextColor": "#e6f4f7", "loopTextColor": "#e6f4f7", "noteBkgColor": "#e6f4f7", "noteTextColor": "#0b1a33", "noteBorderColor": "#67e8f9", "sequenceNumberColor": "#0b1a33", "activationBkgColor": "#1a3a6a", "activationBorderColor": "#67e8f9"}}}%%
flowchart TD
    A["La clínica navega el catálogo y arma el carro"] --> B["Carro: promo resuelta desde src/config/promos.ts"]
    B --> C["Checkout de 5 pasos"]

    subgraph CHECKOUT["CheckoutModal.tsx — 5 pasos"]
        direction TB
        S1["1. Contacto: nombre, email, teléfono"] --> S2["2. Despacho: comuna Melipilla o San Antonio, dirección, código postal"]
        S2 --> MINQ{"San Antonio y subtotal bajo $60.000"}
        MINQ -->|"sí"| BLOCK["Bloqueo con el mensaje de compra mínima"]
        MINQ -->|"no"| S3["3. Documento: RUT Módulo 11, Boleta, SIS si hay insumos regulados"]
        S3 --> S4["4. Pago: Transferencia / Mercado Pago / Cotización WhatsApp"]
    end

    C --> CHECKOUT
    S4 --> SUBMIT["Confirmar Pedido o Generar Cotización"]
    SUBMIT --> WRITE["submitOrder() escribe orders/PRONTO-XXXXXXXX con estado PENDIENTE_*"]
    WRITE --> MARKER["rememberSessionOrderId(): marca de sesión del pedido recién creado"]

    MARKER --> P1{"Método de pago"}
    P1 -->|"mercadopago"| MP["Rama A — Checkout Pro"]
    P1 -->|"transferencia"| TR["Rama B — Transferencia bancaria"]
    P1 -->|"whatsapp"| WQ["Rama C — Cotización asistida"]

    subgraph RAMA_A["Rama A — Mercado Pago Checkout Pro"]
        direction TB
        MP1["POST /api/create-preference: lee el pedido y reprecifica contra el catálogo"]
        MP1 --> MP2["Redirección al Checkout Pro con back_urls y external_reference"]
        MP2 --> MP3["La clínica paga en Mercado Pago"]
        MP3 --> MP4["Retorno a /?status=…&orderId=…"]
        MP4 --> MP5["PaymentReturnModal: mensajes honestos y Ver estado del pedido"]
        MP5 --> MP6{"orderId es el pedido de esta pestaña"}
        MP6 -->|"sí"| MP7["Vacía el carro y consume la marca de sesión"]
        MP6 -->|"no"| MP8["Conserva el carro intacto"]
        MP3 -.->|"servidor a servidor, en paralelo"| WH
    end

    subgraph RAMA_B["Rama B — Transferencia bancaria"]
        direction TB
        TR1["Pedido PENDIENTE_TRANSFERENCIA"]
        TR1 --> TR2["La clínica sube el comprobante: sign → PUT a Cloud Storage → confirm"]
        TR2 --> TR3["TRANSFERENCIA_COMPROBANTE_SUBIDO y alerta de bodega presupuestada"]
        TR3 --> TR4{"Revisión contable del admin"}
        TR4 -->|"approve-transfer"| TR5["TRANSFERENCIA_APROBADA con descuento de stock en transacción"]
        TR4 -->|"cancelar"| TR6["CANCELADO sin movimiento de stock"]
    end

    subgraph RAMA_C["Rama C — Cotización asistida por WhatsApp"]
        direction TB
        WQ1["COTIZACION_SOLICITADA_WHATSAPP"]
        WQ1 --> WQ2["Cotización formal enviada por WhatsApp"]
        WQ2 --> WQ3["Gestión manual: sin cobro en línea ni descuento de stock"]
    end

    WH["POST /api/webhooks/mercadopago — la única autoridad de pago"]
    WH --> FULFILL
    TR5 --> FULFILL
    WQ3 --> FULFILL

    subgraph FULFILL["Preparación, despacho y post-venta"]
        direction TB
        F1["EN_PREPARACION: acondicionamiento en bodega Melipilla"]
        F1 --> F2["dispatch-order: DESPACHADO con courier y guía opcional"]
        F2 --> F3["mark-delivered: ENTREGADO con deliveredAt"]
        F3 --> F4["Seguimiento en línea: /api/track-order con pedido y RUT"]
    end
```

### 1.1 El webhook de Mercado Pago en detalle (la única autoridad de pago)

```mermaid
%%{init: {"theme": "base", "themeCSS": "svg[aria-roledescription]{background:#0b1a33}", "themeVariables": {"background": "#0b1a33", "primaryColor": "#102748", "primaryTextColor": "#e6f4f7", "primaryBorderColor": "#67e8f9", "secondaryColor": "#1a3a6a", "secondaryTextColor": "#e6f4f7", "secondaryBorderColor": "#67e8f9", "tertiaryColor": "#0f1e33", "tertiaryTextColor": "#e6f4f7", "tertiaryBorderColor": "#2a4a7f", "lineColor": "#7c8a9a", "textColor": "#e6f4f7", "titleColor": "#e6f4f7", "edgeLabelBackground": "#102748", "clusterBkg": "#0f1e33", "clusterBorder": "#2a4a7f", "fontFamily": "Inter, system-ui, sans-serif", "actorBkg": "#102748", "actorBorder": "#67e8f9", "actorTextColor": "#e6f4f7", "actorLineColor": "#7c8a9a", "signalColor": "#c9d2db", "signalTextColor": "#e6f4f7", "labelBoxBkgColor": "#102748", "labelBoxBorderColor": "#67e8f9", "labelTextColor": "#e6f4f7", "loopTextColor": "#e6f4f7", "noteBkgColor": "#e6f4f7", "noteTextColor": "#0b1a33", "noteBorderColor": "#67e8f9", "sequenceNumberColor": "#0b1a33", "activationBkgColor": "#1a3a6a", "activationBorderColor": "#67e8f9"}}}%%
flowchart TD
    W0["POST /api/webhooks/mercadopago"] --> W1["Normaliza el id de pago firmado"]
    W1 --> W2{"Firma HMAC x-signature válida"}
    W2 -->|"no"| W2X["401: no se procesa"]
    W2 -->|"sí"| W3["GET api.mercadopago.com/v1/payments/{id}"]
    W3 --> W4{"Respuesta de Mercado Pago"}
    W4 -->|"404: el pago no existe"| W4X["200: se acusa sin efectos"]
    W4 -->|"5xx, token revocado o id malformado"| W4Y["502: Mercado Pago reintenta"]
    W4 -->|"pago aprobado"| W5["Resuelve el pedido por clave de documento"]
    W4 -->|"refunded o charged_back"| R1["Reversión: PAGO_EN_REVISION y alerta de bodega, nunca correo de pago al cliente"]

    W5 --> W6{"mercadopagoPaymentId ya registrado"}
    W6 -->|"sí"| W6X["200: duplicado, sin efectos"]
    W6 -->|"no"| W7{"Estado del pedido pagable"}
    W7 -->|"no"| W7X["PAGO_EN_REVISION, incidente registrado, sin stock"]
    W7 -->|"sí"| W8{"Monto pagado y total del pedido coinciden con el catálogo reprecificado"}
    W8 -->|"no"| W8X["PAGO_EN_REVISION y alerta de bodega, sin stock y sin correo de pago"]
    W8 -->|"sí"| W9["Transacción: PAGADO_MERCADOPAGO, paidAt, historial, descuento de stock y auditoría"]
    W9 --> W10["Correo de pago confirmado al cliente"]
    W9 --> W11["Alerta de bodega con faltantes de stock si los hubo"]
    W9 --> W12["200 received: Mercado Pago no reintenta"]
```

**Descuento de stock a lo sumo una vez:** `paidAt` / `approvedAt` son las marcas de liquidación. Un
pedido cuyas líneas ya se descontaron nunca se puede descontar dos veces — un segundo pago aprobado
sobre un pedido ya liquidado se convierte en un **incidente de doble pago** (registro de historial y
alerta de bodega), nunca en un segundo descuento y nunca en un cambio de estado que haga retroceder
el seguimiento del cliente.

---

## 2. Ciclo de vida del estado del pedido

```mermaid
%%{init: {"theme": "base", "themeCSS": "svg[aria-roledescription]{background:#0b1a33}", "themeVariables": {"background": "#0b1a33", "primaryColor": "#102748", "primaryTextColor": "#e6f4f7", "primaryBorderColor": "#67e8f9", "secondaryColor": "#1a3a6a", "secondaryTextColor": "#e6f4f7", "secondaryBorderColor": "#67e8f9", "tertiaryColor": "#0f1e33", "tertiaryTextColor": "#e6f4f7", "tertiaryBorderColor": "#2a4a7f", "lineColor": "#7c8a9a", "textColor": "#e6f4f7", "titleColor": "#e6f4f7", "edgeLabelBackground": "#102748", "clusterBkg": "#0f1e33", "clusterBorder": "#2a4a7f", "fontFamily": "Inter, system-ui, sans-serif", "actorBkg": "#102748", "actorBorder": "#67e8f9", "actorTextColor": "#e6f4f7", "actorLineColor": "#7c8a9a", "signalColor": "#c9d2db", "signalTextColor": "#e6f4f7", "labelBoxBkgColor": "#102748", "labelBoxBorderColor": "#67e8f9", "labelTextColor": "#e6f4f7", "loopTextColor": "#e6f4f7", "noteBkgColor": "#e6f4f7", "noteTextColor": "#0b1a33", "noteBorderColor": "#67e8f9", "sequenceNumberColor": "#0b1a33", "activationBkgColor": "#1a3a6a", "activationBorderColor": "#67e8f9"}}}%%
stateDiagram-v2
    [*] --> PENDIENTE_PAGO_MERCADOPAGO: checkout con Mercado Pago
    [*] --> PENDIENTE_TRANSFERENCIA: checkout con transferencia
    [*] --> COTIZACION_SOLICITADA_WHATSAPP: checkout con cotización

    PENDIENTE_PAGO_MERCADOPAGO --> PAGADO_MERCADOPAGO: webhook aprobado, monto verificado y stock descontado
    PENDIENTE_PAGO_MERCADOPAGO --> PAGO_EN_REVISION: monto no coincide, estado no pagable o doble pago

    PENDIENTE_TRANSFERENCIA --> TRANSFERENCIA_COMPROBANTE_SUBIDO: upload-voucher confirm
    TRANSFERENCIA_COMPROBANTE_SUBIDO --> TRANSFERENCIA_APROBADA: approve-transfer con descuento de stock
    PENDIENTE_TRANSFERENCIA --> CANCELADO: cancelación administrativa

    PAGO_EN_REVISION --> PAGADO_MERCADOPAGO: resolve-payment-review approve
    PAGO_EN_REVISION --> CANCELADO: resolve-payment-review cancel

    PAGADO_MERCADOPAGO --> PAGO_EN_REVISION: refunded o charged_back
    EN_PREPARACION --> PAGO_EN_REVISION: refunded o charged_back
    DESPACHADO --> PAGO_EN_REVISION: refunded o charged_back

    PAGADO_MERCADOPAGO --> EN_PREPARACION: preparación en bodega
    TRANSFERENCIA_APROBADA --> EN_PREPARACION: preparación en bodega
    EN_PREPARACION --> DESPACHADO: dispatch-order
    DESPACHADO --> ENTREGADO: mark-delivered

    COTIZACION_SOLICITADA_WHATSAPP --> CANCELADO: cotización no aceptada
```

Notas sobre la unión de estados (`src/types/index.ts` §2.1):

* `PAGADO_TRANSFERENCIA` es el estado pagado terminal heredado del flujo manual de transferencia —
  el seguimiento del cliente lo muestra igual que `PAGADO_MERCADOPAGO` (paso 2, `Pago Acreditado`).
* `PENDIENTE_PAGO` existe solo como respaldo genérico del mapa de estados de `submitOrder()`; las
  tres vías del checkout nunca lo producen.
* Los reembolsos quedan deliberadamente **fuera de la plataforma**: una reversión estaciona el
  pedido en `PAGO_EN_REVISION` para conciliación manual en lugar de modelar un estado `REEMBOLSADO`.

---

## 3. Viaje de ida y vuelta de Mercado Pago (vista de secuencia)

```mermaid
%%{init: {"theme": "base", "themeCSS": "svg[aria-roledescription]{background:#0b1a33}", "themeVariables": {"background": "#0b1a33", "primaryColor": "#102748", "primaryTextColor": "#e6f4f7", "primaryBorderColor": "#67e8f9", "secondaryColor": "#1a3a6a", "secondaryTextColor": "#e6f4f7", "secondaryBorderColor": "#67e8f9", "tertiaryColor": "#0f1e33", "tertiaryTextColor": "#e6f4f7", "tertiaryBorderColor": "#2a4a7f", "lineColor": "#7c8a9a", "textColor": "#e6f4f7", "titleColor": "#e6f4f7", "edgeLabelBackground": "#102748", "clusterBkg": "#0f1e33", "clusterBorder": "#2a4a7f", "fontFamily": "Inter, system-ui, sans-serif", "actorBkg": "#102748", "actorBorder": "#67e8f9", "actorTextColor": "#e6f4f7", "actorLineColor": "#7c8a9a", "signalColor": "#c9d2db", "signalTextColor": "#e6f4f7", "labelBoxBkgColor": "#102748", "labelBoxBorderColor": "#67e8f9", "labelTextColor": "#e6f4f7", "loopTextColor": "#e6f4f7", "noteBkgColor": "#e6f4f7", "noteTextColor": "#0b1a33", "noteBorderColor": "#67e8f9", "sequenceNumberColor": "#0b1a33", "activationBkgColor": "#1a3a6a", "activationBorderColor": "#67e8f9"}}}%%
sequenceDiagram
    autonumber
    participant C as Clínica (navegador)
    participant V as API en Vercel
    participant MP as Mercado Pago
    participant FS as Firestore
    participant R as Resend

    C->>FS: submitOrder() → orders/PRONTO-XXXXXXXX (PENDIENTE_PAGO_MERCADOPAGO)
    C->>V: POST /api/create-preference (orderId)
    V->>FS: Lee el pedido, reprecifica contra el catálogo y resuelve la promo del documento
    V->>MP: Crea la preferencia (líneas, back_urls, external_reference)
    MP-->>V: initPoint
    V-->>C: initPoint
    C->>MP: Redirección al Checkout Pro
    Note over C,MP: La clínica paga, y el retorno al sitio y el webhook son eventos independientes
    MP->>V: POST /api/webhooks/mercadopago (x-signature)
    V->>V: Verifica la firma HMAC-SHA256 y normaliza el id de pago
    V->>MP: GET /v1/payments/{id} con el token de servidor
    MP-->>V: Estado del pago y transaction_amount
    V->>FS: Transacción: guardas de estado y monto, PAGADO_MERCADOPAGO, stock e historial
    V->>R: Correo de pago confirmado (cliente)
    V->>R: Alerta de bodega
    V-->>MP: 200 received
    MP-->>C: Retorno a /?status=approved&orderId=… (o failure / pending)
    C->>C: PaymentReturnModal: mensajes honestos, Ver estado del pedido y carro solo si el pedido es de esta pestaña
```

**Por qué el retorno no es el pago:** `auto_return` dispara la redirección en cuanto Mercado Pago
aprueba el cargo, mientras que el webhook es una llamada independiente de servidor a servidor que
puede llegar antes, después o nunca (si el cliente cierra la pestaña). Por eso la tienda muestra el
estado honesto — "recibimos tu retorno de pago, estamos confirmando" — y ofrece al cliente consultar
el estado real a través de `/api/track-order` (pedido más RUT).

---

## 4. Puntos de contacto con el cliente y la bodega después del pago

| Disparador | Superficie | Autoridad / guarda |
| :--- | :--- | :--- |
| Pedido registrado (transferencia, cotización WhatsApp) | `POST /api/order-confirmation` → correo "pedido recibido" | Idempotente vía `confirmationEmailSentAt`; doble factor (pedido + RUT); limitado por IP y por pedido |
| Pago aprobado (Mercado Pago) | Correo de pago confirmado al cliente + alerta de bodega | Solo los envía el webhook tras una liquidación limpia — nunca en un pago marcado o revertido |
| Transferencia aprobada por bodega | Correo al cliente + alerta de bodega | `approve-transfer`, transaccional, a lo sumo una vez |
| Pago estacionado en `PAGO_EN_REVISION` | Solo alerta de bodega | Monto no coincide, estado no pagable, doble pago o reversión — al cliente nunca se le dice que el pago se acreditó |
| Comprobante recibido | Alerta de bodega "comprobante recibido" | Presupuestada por pedido (5 minutos de espera, máximo 5, reservada dentro de la transacción de confirmación) |
| Cualquier pedido | `GET /api/track-order` → línea de tiempo de 5 etapas | Doble factor; un `404` idéntico para pedido inexistente y RUT que no coincide; limitado por IP y por pedido |
| Retorno desde Mercado Pago | `PaymentReturnModal` | Los mensajes afirman solo lo que se sabe; el carro se vacía únicamente si el pedido es de esta pestaña (Task 2.12) |

### 4.1 Quién puede hacer qué (no negociable)

| Acción | Autoridad permitida | Nunca |
| :--- | :--- | :--- |
| Fijar `PAGADO_MERCADOPAGO` | `/api/webhooks/mercadopago`, `resolve-payment-review` (admin) | Componentes del cliente, `api.ts` |
| Descontar `stockCount` | Webhook, `approve-transfer`, `resolve-payment-review` | El navegador |
| Mover a `TRANSFERENCIA_COMPROBANTE_SUBIDO` | `/api/upload-voucher` (fase `confirm`) | Que el cliente escriba directo en Firestore |
| Cobrar un monto | `/api/create-preference` desde el documento del pedido, reprecificado contra el catálogo | Cualquier total o código promo enviado por el cliente |
| Vaciar el carro en un retorno de pago | `App.tsx` cuando `isSessionOrder(orderId)` es verdadero | Una URL por sí sola |

---

## 5. Mapa del código

| Paso | Dónde |
| :--- | :--- |
| Checkout de 5 pasos, guardas, comprobante pro-forma y subida del comprobante | [`src/components/CheckoutModal.tsx`](./src/components/CheckoutModal.tsx) |
| Creación del pedido, id canónico y recálculo de promo/total | [`src/services/api.ts`](./src/services/api.ts) (`submitOrder`, `generateOrderId`) |
| Marca de sesión del pedido | [`src/services/orderSession.ts`](./src/services/orderSession.ts) |
| Modal de retorno de pago y sus mensajes | [`src/components/PaymentReturnModal.tsx`](./src/components/PaymentReturnModal.tsx) |
| Arranque desde la URL y guarda de vaciado del carro | [`src/App.tsx`](./src/App.tsx) (`parseUrlBootstrap`) |
| Preferencia de pago (reprecificación en servidor) | [`api/create-preference.ts`](./api/create-preference.ts) |
| Autoridad de pago (firma, guardas, stock, correos) | [`api/webhooks/mercadopago.ts`](./api/webhooks/mercadopago.ts) |
| Ciclo sign/confirm del comprobante | [`api/upload-voucher.ts`](./api/upload-voucher.ts) |
| Correo de pedido recibido | [`api/order-confirmation.ts`](./api/order-confirmation.ts) |
| Línea de tiempo del seguimiento del cliente | [`api/track-order.ts`](./api/track-order.ts) |
| Transiciones del admin | [`api/_lib/admin/approve-transfer.ts`](./api/_lib/admin/approve-transfer.ts), [`dispatch-order.ts`](./api/_lib/admin/dispatch-order.ts), [`mark-delivered.ts`](./api/_lib/admin/mark-delivered.ts), [`resolve-payment-review.ts`](./api/_lib/admin/resolve-payment-review.ts) |
| Zonas de despacho y umbrales comerciales | [`src/config/delivery.ts`](./src/config/delivery.ts) |

Contratos en profundidad: raíz [AGENTS.md](./AGENTS.md) §3–§4, [`api/AGENTS.md`](./api/AGENTS.md),
[`src/components/AGENTS.md`](./src/components/AGENTS.md), [`src/services/AGENTS.md`](./src/services/AGENTS.md),
[`src/types/AGENTS.md`](./src/types/AGENTS.md).
