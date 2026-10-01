# PRONTO — Manual Order Operations (SOP)

Owner runbook for the money- and goods-side operations the storefront deliberately does **not**
automate: **cancellation, refund, return and chargeback**. The order schema models no refunded
state, and the Mercado Pago webhook preserves a fulfilled status on purpose — so every one of these
is a human decision that must leave an audit trail on the order.

> **Audience:** the owner / backoffice operator. The admin console is at `/admin` → **Pedidos**
> (`#orders`); the slide-over panel is where every action below lives.

---

## 1. Golden rule — verify the money first

Before any action that moves money or goods:

1. Check the **Mercado Pago ledger** (Mercado Pago dashboard → Actividad) and/or the **Banco de
   Chile cartola** for the order.
2. Record what you checked in the operator note (a cartola line, a payment id, a receipt number).
3. **Never type bank credentials, card numbers or passwords into any note field.** A reference is
   enough; the system cannot read the ledger, so the note *is* the evidence.

If you cannot verify the funds, do not cancel, refund or restock — contact the customer first.

---

## 2. Cancellation

Use **Cancelar Pedido** in the panel's "Operaciones Manuales" block. It is offered **only** for
orders that were never settled and never shipped:

| Cancellable | Not cancellable |
| :-- | :-- |
| `PENDIENTE_PAGO_MERCADOPAGO`, `PENDIENTE_PAGO`, `PENDIENTE_TRANSFERENCIA`, `TRANSFERENCIA_COMPROBANTE_SUBIDO` | `PAGADO_MERCADOPAGO`, `TRANSFERENCIA_APROBADA`, `PAGADO_TRANSFERENCIA`, `EN_PREPARACION`, `DESPACHADO`, `ENTREGADO`, `PAGO_EN_REVISION`, `COTIZACION_SOLICITADA_WHATSAPP` |

- A **motivo de cancelación** is mandatory — it becomes the order-history reason.
- Cancelling moves **no stock** and writes **no** refund. The warehouse gets an alert (the order may
  already be picked).
- A `TRANSFERENCIA_COMPROBANTE_SUBIDO` order *is* cancellable: a voucher is not proof the money
  arrived. Verify the cartola first (§1); the motive records that verification.
- The last two rows of the table are refused on purpose: `PAGO_EN_REVISION` uses **Cancelar Pedido
  (sin rebajar stock)** in its own red block, and a WhatsApp quote uses **Declinar Cotización**.
  Those are the audited paths for those states.
- Cancelling an already-cancelled order is a no-op (the panel reports it as a duplicate).

**If the order is paid or shipped, do not cancel it.** Follow §3 or §4 instead.

---

## 3. Refund

A refund happens **outside the platform** (Mercado Pago dashboard or a bank transfer back to the
clinic). The storefront never issues a gateway refund automatically.

1. Verify the original charge (§1) and the amount to return — partial refunds are allowed and were
   already flagged for review by the webhook when Mercado Pago reports them.
2. Perform the refund manually in Mercado Pago or by bank transfer.
3. In the panel's "Operaciones Manuales" block choose **Reembolso**, type the evidence (payment id,
   cartola line, amount) and click **Registrar Incidencia**.
4. Contact the customer and tell them what was returned.

The incident is recorded in the order history **without changing the order status** — a delivered
order stays delivered, because the goods were in fact delivered.

---

## 4. Return & chargeback

- **Devolución** — the clinic sends goods back. Choose **Devolución**, note the reason and the
  received quantity, then handle the money per §3 if a refund is owed. **Restock only what actually
  came back and is usable** (§5).
- **Contracargo** — the customer's bank reverses the charge. Choose **Contracargo**, note the bank
  case reference, and keep the order status as it is; the money side is resolved with the bank.

Both are recorded the same way: kind + evidence → **Registrar Incidencia**. Several incidents on one
order are normal (e.g. a return followed by a refund).

---

## 5. Restock rule

Restock is **not** part of the cancellation or incident actions. It is a separate, audited step in
**Inventario**:

1. Only **physically received, usable** units may be restocked.
2. Use the audited stock adjustment with the right reason:
   - `reposicion` — received in good condition, back on sale.
   - `merma` — damaged, expired or unusable: **do not** put it back on sale.
   - `correccion` — a counting correction.
3. Type the **order id** into the "Nota de trazabilidad" field (e.g. "devolución del pedido
   PRONTO-7K3M9Q2Z, 2 cajas en buen estado"). That note is stored as the audit entry's
   `operatorNotes`, and it is the only thing that links a movement back to the order it came from.

Never restock a dispatched-but-not-returned order, and never restock before the goods are physically
in the Melipilla warehouse.

---

## 6. Where the audit trail lives

Every action above writes to the order's **Historial de Estados y Auditoría** block in the slide-over
panel:

| Event | What it records |
| :-- | :-- |
| `CANCELACION_MANUAL` | a cancellation, with the operator's motive and actor |
| `INCIDENTE_MANUAL` | a refund / return / chargeback, shown with its kind badge and the evidence note |
| `PAGO_REEMBOLSO_PARCIAL` | a partial refund detected by the Mercado Pago webhook (automatic) |
| `PAGO_DUPLICADO` / `PAGO_ESTADO_INVALIDO` | payment incidents the webhook parked for review |

The inventory movements are logged **server-side** in `inventory_audit_logs` (reason code, actor,
timestamp, delta and the trace note from §5). The console does **not** render that log yet — it has to
be queried from the Firebase console, so the trace note is what makes a restock findable after the
fact.

---

## 7. Escalation

- Money you cannot reconcile → **leave the order untouched**, record an incident with what you know,
  and follow it up with Mercado Pago / the bank before dispatching.
- A payment flagged **Pago en Revisión** → use its own block (**Confirmar Pago y Rebajar Stock** or
  **Cancelar Pedido**) — that is the audited resolution for that state, and it requires a
  reconciliation note.
- Anything that would need an automatic gateway refund, a new order status or a second restock path
  is **out of scope by design** — raise it as a roadmap task instead of improvising.
