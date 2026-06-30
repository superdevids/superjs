export function apiVersion(version: string): string {
  const v = version.startsWith('v') ? version : `v${version}`
  return `/api/${v}`
}

export function apiVersionGroup(version: string): { prefix: string; middleware: string[] } {
  return {
    prefix: apiVersion(version),
    middleware: [],
  }
}

const versionMap = new Map<string, Map<string, any>>()

export function registerVersion(version: string, resource: string, handler: any): void {
  if (!versionMap.has(version)) {
    versionMap.set(version, new Map())
  }
  versionMap.get(version)!.set(resource, handler)
}

export function getVersionedHandler(resource: string, version: string): any | undefined {
  const handlers = versionMap.get(version)
  if (handlers?.has(resource)) return handlers.get(resource)

  const versions = Array.from(versionMap.keys()).sort()
  for (const v of versions.reverse()) {
    if (v <= version && versionMap.get(v)?.has(resource)) {
      return versionMap.get(v)!.get(resource)
    }
  }

  return undefined
}

export function listVersions(): string[] {
  return Array.from(versionMap.keys()).sort()
}
