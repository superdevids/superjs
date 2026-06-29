#!/usr/bin/env node
import { parseArgs } from '../native/args.js'
import { colors } from '../native/colors.js'
import { build as buildCommand } from './commands/build.js'
import { deploy } from './commands/deploy.js'
import { initProject } from './commands/init.js'
import { listRoutes } from './commands/list-routes.js'
import { makeAuth } from './commands/make-auth.js'
import { makeController } from './commands/make-controller.js'
import { makeMiddleware } from './commands/make-middleware.js'
import { makeMigration } from './commands/make-migration.js'
import { makeModel } from './commands/make-model.js'
import { makeCrud } from './commands/make-crud.js'
import { makeResource } from './commands/make-resource.js'
import { makeSchema } from './commands/make-schema.js'
import { generateSdk } from './commands/generate-sdk.js'
import { serve } from './commands/serve.js'

function showHelp(): void {
  console.log(`${colors.bold('SpeexJS')} ${colors.cyan('v0.2.0')}`)
  console.log('Fullstack JavaScript/TypeScript Framework')
  console.log()
  console.log(`${colors.bold('Usage:')}`)
  console.log('  speexjs init [name] [options]              Create new project')
  console.log('  speexjs build [options]                    Build the project')
  console.log('  speexjs build --ssg                        Build with Static Site Generation')
  console.log('  speexjs bench                              Run benchmarks')
  console.log('  speexjs make:controller <name>             Generate controller')
  console.log('  speexjs make:middleware <name>             Generate middleware')
  console.log('  speexjs make:migration <name>              Generate migration')
  console.log('  speexjs make:model <name>                  Generate model')
  console.log('  speexjs make:auth [options]                Generate auth scaffold')
  console.log('  speexjs make:resource <name>               Generate resource (controller + model + migration)')
  console.log('  speexjs make:schema <name>                 Generate schema')
  console.log('  speexjs make:crud                          Generate complete CRUD (interactive)')
  console.log('  speexjs migrate                            Run migrations')
  console.log('  speexjs db:seed                            Seed the database')
  console.log('  speexjs list-routes                        View all routes')
  console.log('  speexjs serve [options]                    Run server')
  console.log('  speexjs generate:sdk [options]             Generate TypeScript SDK from OpenAPI spec')
  console.log('  speexjs deploy [options]                   Deploy application (docker/vercel)')
  console.log('  speexjs --help                             Show help')
  console.log()
  console.log(`${colors.bold('Aliases:')}`)
  console.log('  speexjs -v, --version                      View version')
  console.log()
  console.log(`${colors.bold('Options:')}`)
  console.log('  --template <type>    blank, fullstack, api-only')
  console.log('  --frontend <fe>      super, react, vue')
  console.log('  --port <number>      Port server (default: 3000)')
  console.log('  --host <string>      Host address (default: localhost)')
  console.log('  --ssg                Generate static site (with build)')
  console.log('  --docs               Serve documentation site')
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv)
  const command = parsed.command

  switch (command) {
    case 'init': {
      await initProject(parsed.args[0] || 'my-app', parsed.options)
      break
    }
    case 'make:controller': {
      if (!parsed.args[0]) {
        console.error(colors.red('Controller name required'))
        console.log(`  ${colors.cyan('speexjs make:controller <name>')}`)
        process.exit(1)
      }
      await makeController(parsed.args[0])
      break
    }
    case 'make:middleware': {
      if (!parsed.args[0]) {
        console.error(colors.red('Middleware name required'))
        console.log(`  ${colors.cyan('speexjs make:middleware <name>')}`)
        process.exit(1)
      }
      await makeMiddleware(parsed.args[0])
      break
    }
    case 'make:schema': {
      if (!parsed.args[0]) {
        console.error(colors.red('Schema name required'))
        console.log(`  ${colors.cyan('speexjs make:schema <name>')}`)
        process.exit(1)
      }
      await makeSchema(parsed.args[0])
      break
    }
    case 'make:migration': {
      if (!parsed.args[0]) {
        console.error(colors.red('Migration name required'))
        console.log(`  ${colors.cyan('speexjs make:migration <name>')}`)
        process.exit(1)
      }
      await makeMigration(parsed.args[0])
      break
    }
    case 'make:model': {
      if (!parsed.args[0]) {
        console.error(colors.red('Model name required'))
        console.log(`  ${colors.cyan('speexjs make:model <name>')}`)
        process.exit(1)
      }
      await makeModel(parsed.args[0])
      break
    }
    case 'make:resource': {
      if (!parsed.args[0]) {
        console.error(colors.red('Resource name required'))
        console.log(`  ${colors.cyan('speexjs make:resource <name>')}`)
        process.exit(1)
      }
      await makeResource(parsed.args[0])
      break
    }
    case 'make:auth': {
      await makeAuth({
        guard: (parsed.options.guard as 'session' | 'token' | 'sanctum') || 'session',
        views: parsed.options['no-views'] !== true,
        api: parsed.options.api === true,
      })
      break
    }
    case 'generate:sdk': {
      await generateSdk({
        output: parsed.options.output as string | undefined,
        name: parsed.options.name as string | undefined,
        format: parsed.options.format as string | undefined,
      })
      break
    }
    case 'deploy': {
      await deploy({
        docker: parsed.options.docker === true,
        vercel: parsed.options.vercel === true,
        init: parsed.options.init === true,
      })
      break
    }
    case 'migrate':
    case 'db:seed': {
      const label = command === 'migrate' ? 'Migration' : 'Database seeding'
      console.log(`${colors.yellow('⏳')} ${label} coming soon...`)
      break
    }
    case 'list-routes':
    case 'routes':
    case 'lr': {
      await listRoutes()
      break
    }
    case 'build': {
      await buildCommand({
        ssg: parsed.options.ssg === true,
        outDir: (parsed.options.outDir as string) ?? 'dist',
      })
      break
    }
    case 'bench':
    case 'benchmark': {
      await runBenchmarks()
      break
    }
    case 'make:crud':
    case 'crud': {
      await makeCrud()
      break
    }
    case 'serve':
    case 'dev': {
      await serve(parsed.options)
      break
    }
    case 'help':
    case '--help':
    case '-h': {
      showHelp()
      break
    }
    case 'version':
    case '--version':
    case '-v': {
      console.log('SpeexJS v0.2.0')
      break
    }
    default: {
      if (command) {
        console.error(`${colors.red(`Unknown command '${command}'`)}`)
        console.log()
      }
      showHelp()
      if (command) process.exit(1)
    }
  }
}

async function runBenchmarks(): Promise<void> {
  const cwd = process.cwd()

  const benchPaths = [`${cwd}/benchmarks/framework.bench.ts`, `${cwd}/benchmarks/index.bench.ts`]

  for (const bp of benchPaths) {
    const { existsSync } = await import('node:fs')
    if (existsSync(bp)) {
      console.log(`${colors.cyan('→')} Running benchmarks...\n`)
      const { execSync } = await import('node:child_process')
      try {
        execSync(`npx tsx ${bp}`, { stdio: 'inherit', cwd })
      } catch {
        process.exit(1)
      }
      return
    }
  }

  console.error(`${colors.red('✗')} No benchmark file found`)
  console.log(`  Expected: benchmarks/framework.bench.ts or benchmarks/index.bench.ts`)
  process.exit(1)
}

main().catch((err) => {
  console.error(colors.red(`Error: ${err.message}`))
  process.exit(1)
})
