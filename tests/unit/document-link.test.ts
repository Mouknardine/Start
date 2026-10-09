import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signerLienDocument, verifierLienDocument } from '@/lib/document-link'
import { numeroWhatsApp } from '@/lib/phone'

const ID = '11111111-1111-4111-8111-111111111111'

describe('liens de partage des documents', () => {
  const avant = { ...process.env }
  beforeEach(() => { process.env.DOCUMENT_LINK_SECRET = 'secret-de-test' })
  afterEach(() => { process.env = { ...avant } })

  it('signe puis vérifie', () => {
    const t = signerLienDocument(ID)!
    expect(t.startsWith(ID + '.')).toBe(true)
    expect(verifierLienDocument(t)).toBe(ID)
  })
  it('refuse une signature modifiée ou un autre document', () => {
    const t = signerLienDocument(ID)!
    expect(verifierLienDocument(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'))).toBeNull()
    const autre = '22222222-2222-4222-8222-222222222222'
    expect(verifierLienDocument(autre + '.' + t.split('.')[1])).toBeNull()
    expect(verifierLienDocument('pas-un-jeton')).toBeNull()
  })
  it('désactivé sans clé', () => {
    delete process.env.DOCUMENT_LINK_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(signerLienDocument(ID)).toBeNull()
    expect(verifierLienDocument(ID + '.abc')).toBeNull()
  })
})

describe('numeroWhatsApp', () => {
  it('format international sans +', () => {
    expect(numeroWhatsApp('079 123 45 67')).toBe('41791234567')
    expect(numeroWhatsApp('+33 6 12 34 56 78')).toBe('33612345678')
    expect(numeroWhatsApp('')).toBe('')
  })
})
