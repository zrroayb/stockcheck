import { readFileSync } from 'node:fs'

function parseEnv(text) {
  const values = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    const [, key, raw] = match
    values[key] = raw.replace(/^"|"$/g, '')
  }
  return values
}

function mask(value) {
  if (!value) return '(empty)'
  if (value.length <= 12) return '***'
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function host(value) {
  try {
    return new URL(value).host
  } catch {
    return '(invalid url)'
  }
}

const env = parseEnv(readFileSync('.env', 'utf8'))

console.log('APP_ENV:', env.APP_ENV || '(missing)')
console.log('NEXT_PUBLIC_APP_ENV:', env.NEXT_PUBLIC_APP_ENV || '(missing)')
console.log('DATABASE host:', host(env.DATABASE_URL))
console.log('REDIS host:', host(env.REDIS_URL))
console.log('APP URL:', env.NEXT_PUBLIC_APP_URL || '(missing)')
console.log('CLERK publishable:', mask(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY))
console.log('CLERK secret:', mask(env.CLERK_SECRET_KEY))
console.log('ENCRYPTION_KEY:', env.ENCRYPTION_KEY?.length === 64 ? 'set (64 hex chars)' : 'missing/invalid')

if (env.APP_ENV === 'production') {
  console.log('')
  console.log('WARNING: production environment is active.')
}
