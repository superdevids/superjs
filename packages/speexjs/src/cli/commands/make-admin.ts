import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { colors } from '../../native/colors.js'

export function makeAdmin(name: string): void {
  const targetDir = resolve(process.cwd(), name ? `src/${name}` : 'src/admin')
  mkdirSync(targetDir, { recursive: true })

  const files: Record<string, string> = {
    'dashboard.tsx': `import type { VNode } from 'speexjs/client/vdom'
export default function Dashboard(): VNode {
  return <html><head><title>Admin</title></head><body><h1>Admin Dashboard</h1></body></html>
}`,
    'users.tsx': `import type { VNode } from 'speexjs/client/vdom'
export default function Users(): VNode { return <html><head><title>Users</title></head><body><h1>Users</h1></body></html> }`,
  }

  for (const [file, content] of Object.entries(files)) {
    const fullPath = resolve(targetDir, file)
    writeFileSync(fullPath, content, 'utf-8')
    console.log(`${colors.green('✅')} Admin page created at ${colors.cyan(file)}`)
  }
}
