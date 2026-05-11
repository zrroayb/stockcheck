import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const aliases = {
  dev: 'development',
  local: 'development',
  development: 'development',
  stage: 'staging',
  staging: 'staging',
  prod: 'production',
  production: 'production',
}

const requested = process.argv[2]
const profile = aliases[requested]

if (!profile) {
  console.error('Usage: node scripts/use-env.mjs <development|staging|production>')
  process.exit(1)
}

const source = resolve(`.env.${profile}`)
const example = resolve(`.env.${profile}.example`)
const target = resolve('.env')

if (!existsSync(source)) {
  console.error(`Missing ${source}`)
  console.error(`Create it from ${example} first, then fill the real secrets.`)
  process.exit(1)
}

const contents = readFileSync(source, 'utf8')
const appEnv = contents.match(/^APP_ENV="?([^"\n]+)"?/m)?.[1]

if (appEnv && appEnv !== profile) {
  console.error(`APP_ENV in ${source} is "${appEnv}", expected "${profile}".`)
  process.exit(1)
}

copyFileSync(source, target)
console.log(`Activated ${profile} environment -> .env`)
