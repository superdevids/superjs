export interface DeprecationOptions {
  deprecated?: boolean
  sunset?: string
  migration?: string
  deprecationMessage?: string
}

const DEPRECATION_HEADER = 'Deprecation'
const SUNSET_HEADER = 'Sunset'
const LINK_HEADER = 'Link'

export function formatDeprecationHeaders(options: DeprecationOptions): Record<string, string> {
  const headers: Record<string, string> = {}

  if (options.deprecated) {
    headers[DEPRECATION_HEADER] = 'true'

    if (options.sunset) {
      const sunsetDate = new Date(options.sunset)
      headers[SUNSET_HEADER] = sunsetDate.toUTCString()
    }

    if (options.migration) {
      headers[LINK_HEADER] = `<${options.migration}>; rel="successor-version"`
    }

    if (options.deprecationMessage) {
      headers['Deprecation-Message'] = options.deprecationMessage
    }
  }

  return headers
}

export function isDeprecated(route: any): boolean {
  return route?.deprecated === true || route?.sunset !== undefined
}

export function getSunsetDate(route: any): Date | null {
  return route?.sunset ? new Date(route.sunset) : null
}

export function isExpired(route: any): boolean {
  const sunset = getSunsetDate(route)
  return sunset !== null && sunset < new Date()
}
