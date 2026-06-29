import { colors } from '../../native/colors.js'

export async function tinker(): Promise<void> {
  const { createInterface } = await import('node:readline')
  console.log(`${colors.green('⚡ SpeexJS Tinker')} - Interactive REPL`)
  console.log('Type .help for commands, .exit to quit\n')

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'speexjs> ' })
  rl.prompt()

  rl.on('line', async (line: string) => {
    const cmd = line.trim()
    if (cmd === '.exit' || cmd === '.quit') { rl.close(); return }
    if (cmd === '.help') { console.log('Commands: .exit, .help, <any JS expression>'); rl.prompt(); return }
    if (!cmd) { rl.prompt(); return }
    try {
      const result = await eval(`(async () => { return ${cmd} })()`)
      console.log(colors.cyan(JSON.stringify(result, null, 2)))
    } catch (e: any) { console.error(colors.red(e.message)) }
    rl.prompt()
  })

  rl.on('close', () => { console.log('\nBye!'); process.exit(0) })
}
