import type { Firestore, DocumentReference, DocumentData } from 'firebase-admin/firestore'
import { getCollectionName } from './firestoreEnv.js'

export interface ResolvedOrder {
  ref: DocumentReference
  /**
   * Raw order fields, typed exactly as `DocumentReference.get()` returns them.
   * Deliberately kept as the SDK's own `DocumentData` so this extraction does not
   * change how the endpoints read untrusted document fields — tightening those
   * reads is the separate TODO 8.2/8.10 work.
   */
  data: DocumentData
}

/**
 * Canonical order lookup (Task 0.12).
 *
 * The Firestore document id IS the canonical order id — `submitOrder()` writes
 * `setDoc(doc(db, getCollectionName('orders'), orderId), payload)` — so every
 * server endpoint must resolve the document key FIRST and only fall back to the
 * `where('orderId','==')` field query for legacy documents.
 *
 * Resolving by field alone lets a decoy document (any document id, an `orderId`
 * field pointing at a victim's id) shadow the real order for the payment webhook,
 * the public tracking endpoint and the confirmation mail. `firestore.rules` now
 * binds the field to the document id so new decoys cannot be created; the lookup
 * order stays defensive for documents written before that rule.
 */
export async function resolveOrderByCanonicalId(
  adminDb: Firestore,
  cleanOrderId: string
): Promise<ResolvedOrder | null> {
  const collection = adminDb.collection(getCollectionName('orders'))

  // `CollectionReference.doc()` throws synchronously for an id that is empty or
  // contains a `/` (a document id is a path). These resolvers are reachable from
  // unauthenticated endpoints, so a malformed string must degrade to "not found"
  // instead of surfacing a 500 with SDK internals — the field query below is a
  // plain string comparison and can never throw.
  const canUseDocumentKey = cleanOrderId.length > 0 && !cleanOrderId.includes('/')

  if (canUseDocumentKey) {
    const direct = await collection.doc(cleanOrderId).get()
    if (direct.exists) {
      return { ref: direct.ref, data: (direct.data() || {}) as DocumentData }
    }
  }

  const snapshot = await collection.where('orderId', '==', cleanOrderId).limit(1).get()
  if (snapshot.empty) return null

  const doc = snapshot.docs[0]
  console.warn(
    `[orderLookup] Order "${cleanOrderId}" resolved through the orderId field fallback ` +
      `(document id "${doc.id}" differs). Only legacy pre-0.12 documents should take this path.`
  )
  return { ref: doc.ref, data: (doc.data() || {}) as DocumentData }
}
