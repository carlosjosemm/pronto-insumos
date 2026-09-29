import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Cloud Storage Security Rules (storage.rules & firebase.json)', () => {
  const rootDir = path.resolve(__dirname, '../../../')
  const rulesPath = path.join(rootDir, 'storage.rules')
  const configPath = path.join(rootDir, 'firebase.json')

  it('should have a storage.rules file at repository root with rules_version 2', () => {
    expect(fs.existsSync(rulesPath)).toBe(true)
    const content = fs.readFileSync(rulesPath, 'utf8')
    expect(content).toContain("rules_version = '2';")
    expect(content).toContain('service firebase.storage')
  })

  it('should deny every client-side read and write on the voucher bucket', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')

    expect(content).toMatch(/match\s+\/b\/\{bucket\}\/o\s*\{/)
    expect(content).toMatch(/match\s+\/\{allPaths=\*\*\}\s*\{/)
    expect(content).toMatch(/allow\s+read,\s*write:\s*if\s+false;/)

    // Never a permissive grant, in any spelling
    expect(content).not.toMatch(/allow\s+read:\s*if\s+true/)
    expect(content).not.toMatch(/allow\s+write:\s*if\s+true/)
    expect(content).not.toMatch(/if\s+request\.auth\s*!=\s*null/)
  })

  it('should register the storage rules in firebase.json', () => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    expect(config.storage).toBeDefined()
    expect(config.storage.rules).toBe('storage.rules')
  })

  it('should keep the storage-rules deploy script separate from the Firestore one', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    expect(pkg.scripts['deploy:storage-rules']).toBe('pnpm dlx firebase-tools deploy --only storage')
    // Unchanged: deploying storage rules on Spark fails, so the Firestore script stays scoped
    expect(pkg.scripts['deploy:rules']).toBe('pnpm dlx firebase-tools deploy --only firestore:rules')
  })

  it('should ship a bucket CORS config allowing the browser PUT preflight', () => {
    const corsPath = path.join(rootDir, 'scripts/storage-cors.json')
    expect(fs.existsSync(corsPath)).toBe(true)

    const cors = JSON.parse(fs.readFileSync(corsPath, 'utf8'))
    expect(Array.isArray(cors)).toBe(true)
    expect(cors[0].method).toContain('PUT')
    // GCS builds Access-Control-Allow-Headers from this list, so the signed
    // `x-goog-content-length-range` request header must be present for the PUT preflight
    expect(cors[0].responseHeader).toContain('Content-Type')
    expect(cors[0].responseHeader).toContain('x-goog-content-length-range')
  })
})
