import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { WHATSAPP_NUMBER, WHATSAPP_DISPLAY, whatsappLink } from '../../config/contact'

const rootDir = path.resolve(__dirname, '../../..')

afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * Module-level env reads are frozen at first import, so `vi.stubEnv` alone cannot
 * change them — the module must be re-evaluated (the pattern used by
 * src/tests/api/firebaseAdmin.test.ts).
 */
async function loadContactModule() {
  vi.resetModules()
  return import('../../config/contact')
}

function collectSourceFiles(dir: string, extensions: string[]): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(fullPath, extensions)
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [fullPath] : []
  })
}

describe('WhatsApp contact configuration (src/config/contact)', () => {
  it('derives the display format from the pinned test number', () => {
    expect(WHATSAPP_NUMBER).toBe('56912345678')
    expect(WHATSAPP_DISPLAY).toBe('+56 9 1234 5678')
  })

  it('builds a wa.me link, encoding the optional text', () => {
    expect(whatsappLink()).toBe(`https://wa.me/${WHATSAPP_NUMBER}`)
    expect(whatsappLink('Hola clínica')).toBe(`https://wa.me/${WHATSAPP_NUMBER}?text=Hola%20cl%C3%ADnica`)
  })

  it('reads VITE_WHATSAPP_NUMBER when the variable is configured', async () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '56999887766')

    const contact = await loadContactModule()

    expect(contact.WHATSAPP_NUMBER).toBe('56999887766')
    expect(contact.whatsappLink()).toBe('https://wa.me/56999887766')
  })

  it('falls back to the canonical production line when the env var is unset (Task 2.10)', async () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '')

    const contact = await loadContactModule()

    expect(contact.WHATSAPP_NUMBER).toBe('56929831595')
    expect(contact.whatsappLink()).toBe('https://wa.me/56929831595')
  })

  it('normalizes a formatted env value to digits instead of emitting a dead wa.me link', async () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '+56 9 2983 1595')

    const contact = await loadContactModule()

    expect(contact.WHATSAPP_NUMBER).toBe('56929831595')
    expect(contact.WHATSAPP_DISPLAY).toBe('+56 9 2983 1595')
    expect(contact.whatsappLink()).toBe('https://wa.me/56929831595')
  })

  it('falls back to the canonical line when the env var carries no digits at all', async () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', 'not-a-number')

    const contact = await loadContactModule()

    expect(contact.WHATSAPP_NUMBER).toBe('56929831595')
  })
})

describe('WhatsApp single-source guard (Task 2.10)', () => {
  const scannedFiles = [
    ...collectSourceFiles(path.join(rootDir, 'src/components'), ['.ts', '.tsx']),
    ...collectSourceFiles(path.join(rootDir, 'src/services'), ['.ts']),
    ...collectSourceFiles(path.join(rootDir, 'src/admin'), ['.ts', '.tsx'])
  ]

  it('scans the storefront component, service and admin trees', () => {
    expect(scannedFiles.length).toBeGreaterThan(40)
  })

  it('never hardcodes a wa.me URL, a phone literal or a VITE_WHATSAPP_NUMBER read', () => {
    const offenders = scannedFiles.filter((file) => {
      const source = fs.readFileSync(file, 'utf8')
      return /wa\.me/.test(source) || /\b569\d{7,8}\b/.test(source) || /VITE_WHATSAPP_NUMBER/.test(source)
    })

    expect(offenders.map((file) => path.relative(rootDir, file))).toEqual([])
  })

  it('advertises the canonical number in the index.html JSON-LD structured data', async () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '')
    const contact = await loadContactModule()
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8')

    expect(html).toContain(`"telephone": "+${contact.WHATSAPP_NUMBER}"`)
    expect(html).not.toContain('+56912345678')
  })
})
