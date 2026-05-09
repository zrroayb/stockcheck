export class InsufficientStockError extends Error {
  readonly productId: string
  readonly available: number
  readonly requested: number

  constructor(productId: string, available: number, requested: number) {
    super(`Product ${productId}: requested ${requested}, available ${available}`)
    this.name = 'InsufficientStockError'
    this.productId = productId
    this.available = available
    this.requested = requested
  }
}

export class PlatformApiError extends Error {
  readonly platform: string
  readonly status?: number
  readonly body?: string

  constructor(platform: string, message: string, status?: number, body?: string) {
    super(`[${platform}] ${message}${status ? ` (HTTP ${status})` : ''}`)
    this.name = 'PlatformApiError'
    this.platform = platform
    this.status = status
    this.body = body
  }
}

export class CredentialDecryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CredentialDecryptionError'
  }
}
