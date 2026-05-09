import crypto from 'node:crypto'

// AES-256-GCM credential encryption.
// Wire format (hex-encoded): iv(12) | tag(16) | ciphertext
//   - iv:  random per-message, never reused
//   - tag: GCM auth tag, verifies the ciphertext hasn't been tampered with
//   - ciphertext: variable length

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function loadKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) {
    throw new Error('ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32')
  }
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`)
  }
  return key
}

export function encrypt(plaintext: string): string {
  const key = loadKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('hex')
}

export function decrypt(payload: string): string {
  const key = loadKey()
  const buf = Buffer.from(payload, 'hex')
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error('Encrypted payload is malformed (too short)')
  }
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export function encryptJSON(value: unknown): string {
  return encrypt(JSON.stringify(value))
}

export function decryptJSON<T = unknown>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T
}
