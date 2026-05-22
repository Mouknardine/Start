import { describe, it, expect } from 'vitest'
import {
  demandeSchema,
  avisSchema,
  messageSchema,
  parsePayload,
} from '@/lib/validation/schemas'

describe('demandeSchema', () => {
  const valid = {
    artisan_id: 'b79cc358-e7fe-47ab-b3d8-cb1114f56c92',
    client_nom: 'Jean Dupont',
    client_email: 'jean@example.com',
    client_telephone: '0791234567',
    type: 'devis' as const,
    message: 'Bonjour, je voudrais un devis pour ma cuisine.',
  }

  it('accepte une demande valide', () => {
    const r = parsePayload(demandeSchema, valid)
    expect(r.success).toBe(true)
  })

  it('rejette un artisan_id non-UUID', () => {
    const r = parsePayload(demandeSchema, { ...valid, artisan_id: 'pas-un-uuid' })
    expect(r.success).toBe(false)
  })

  it('rejette un email invalide', () => {
    const r = parsePayload(demandeSchema, { ...valid, client_email: 'pas-un-email' })
    expect(r.success).toBe(false)
  })

  it('rejette un message trop court', () => {
    const r = parsePayload(demandeSchema, { ...valid, message: 'ok' })
    expect(r.success).toBe(false)
  })

  it('rejette un message trop long', () => {
    const r = parsePayload(demandeSchema, { ...valid, message: 'x'.repeat(6000) })
    expect(r.success).toBe(false)
  })

  it('rejette un type invalide', () => {
    const r = parsePayload(demandeSchema, { ...valid, type: 'spam' })
    expect(r.success).toBe(false)
  })
})

describe('avisSchema', () => {
  const valid = {
    artisan_id: 'b79cc358-e7fe-47ab-b3d8-cb1114f56c92',
    client_nom: 'Jean Dupont',
    client_email: 'jean@example.com',
    note: 5,
    commentaire: 'Excellent travail.',
  }

  it('accepte un avis valide', () => {
    const r = parsePayload(avisSchema, valid)
    expect(r.success).toBe(true)
  })

  it('rejette une note hors bornes', () => {
    expect(parsePayload(avisSchema, { ...valid, note: 0 }).success).toBe(false)
    expect(parsePayload(avisSchema, { ...valid, note: 6 }).success).toBe(false)
    expect(parsePayload(avisSchema, { ...valid, note: 99 }).success).toBe(false)
  })

  it('accepte un commentaire vide', () => {
    const r = parsePayload(avisSchema, { ...valid, commentaire: '' })
    expect(r.success).toBe(true)
  })
})

describe('messageSchema', () => {
  it('rejette content vide', () => {
    const r = parsePayload(messageSchema, {
      demande_id: 'b79cc358-e7fe-47ab-b3d8-cb1114f56c92',
      content: '',
    })
    expect(r.success).toBe(false)
  })

  it('rejette content trop long', () => {
    const r = parsePayload(messageSchema, {
      demande_id: 'b79cc358-e7fe-47ab-b3d8-cb1114f56c92',
      content: 'x'.repeat(3000),
    })
    expect(r.success).toBe(false)
  })

  it('accepte un message valide', () => {
    const r = parsePayload(messageSchema, {
      demande_id: 'b79cc358-e7fe-47ab-b3d8-cb1114f56c92',
      content: 'Bonjour, je peux passer mardi 14h.',
    })
    expect(r.success).toBe(true)
  })
})
