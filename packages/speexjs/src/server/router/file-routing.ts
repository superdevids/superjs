import { readdirSync } from 'node:fs'
import { join, extname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Router } from './index.js'

export async function registerFileRoutes(router: Router, routesDir: string): Promise<void> {
  const absDir = resolve(routesDir)
  
  async function walk(dir: string): Promise<void> {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { await walk(full); continue }
      
      const ext = extname(entry.name)
      if (ext !== '.ts' && ext !== '.js') continue
      
      const routePath = '/' + relative(absDir, full)
        .replace(/\\/g, '/')
        .replace(/\.[jt]s$/, '')
        .replace(/\/index$/, '')
        .replace(/\[(\w+)\]/g, ':$1')
      
      try {
        const mod = await import(pathToFileURL(full).href)
        if (typeof mod.get === 'function') router.get(routePath, mod.get)
        if (typeof mod.post === 'function') router.post(routePath, mod.post)
        if (typeof mod.put === 'function') router.put(routePath, mod.put)
        if (typeof mod.patch === 'function') router.patch(routePath, mod.patch)
        if (typeof mod.del === 'function') router.delete(routePath, mod.del)
      } catch { /* skip invalid files */ }
    }
  }
  await walk(absDir)
}
