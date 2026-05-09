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
  let hex = process.env.ENCRYPTION_KEY?.trim() ?? ''
  // Strip one layer of wrapping quotes (.env parsers sometimes leave these)
  if (
    (hex.startsWith('"') && hex.endsWith('"')) ||
    (hex.startsWith("'") && hex.endsWith("'"))
  ) {
    hex = hex.slice(1, -1)
  }
  if (!hex) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate a 32-byte hex key: openssl rand -hex 32  — then paste ONLY the 64-character output into .env (shell command substitution inside .env does not run)'
    )
  }
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    const literalCommand = hex.includes('openssl') || hex.includes('$(')
    throw new Error(
      literalCommand
        ? 'ENCRYPTION_KEY looks like an un-expanded shell command. In .env you must paste the openssl output literally, not "$(openssl rand -hex 32)". Run: openssl rand -hex 32'
        : `ENCRYPTION_KEY must be 64 hex characters (32 bytes), got decoded length ${key.length}. Generate: openssl rand -hex 32`
    )
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
