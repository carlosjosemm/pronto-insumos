import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(__dirname, '../../..')
const css = fs.readFileSync(path.join(rootDir, 'src/index.css'), 'utf8')

/**
 * jsdom cannot evaluate media queries, so the mobile single-column acceptance
 * criterion (Task 8.7) is guarded as a stylesheet-content assertion — the same
 * pattern used by src/tests/security/firestore-rules.test.ts.
 */
describe('storefront stylesheet invariants (Task 8.7)', () => {
  it('collapses the catalog grid to a single column below 560px', () => {
    const mobileBlock = css.match(/@media \(max-width: 560px\) \{[\s\S]*?\n\}/)

    expect(mobileBlock).not.toBeNull()
    expect(mobileBlock?.[0]).toContain('.products-grid')
    expect(mobileBlock?.[0]).toMatch(/grid-template-columns:\s*1fr/)
  })

  it('keeps the 2-column layout for large phones and small tablets (561–768px)', () => {
    const tabletBlock = css.match(/@media \(max-width: 768px\) \{[\s\S]*?\n\}/g) ?? []

    expect(
      tabletBlock.some((block) => block.includes('.products-grid') && /repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(block))
    ).toBe(true)
  })
})
