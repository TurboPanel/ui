#!/usr/bin/env node
/**
 * Prompt for a native control-plane origin, then exec `expo start`.
 * Skipped for non-TTY, CI, an already-set URL, or TURBOPANEL_SKIP_CONTROL_PLANE_PROMPT=1.
 * Not used by `pnpm web` or the systemd Expo unit.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const DEFAULT_ORIGIN = 'https://localhost:8443'
const ENV_FILE = '.env.development.local'
const ENV_KEY = 'EXPO_PUBLIC_CONTROL_PLANE_URL'

function shouldPrompt() {
  if (process.env.TURBOPANEL_SKIP_CONTROL_PLANE_PROMPT === '1') return false
  if (process.env.EXPO_PUBLIC_CONTROL_PLANE_URL?.trim()) return false
  if (process.env.CI === 'true' || process.env.CI === '1') return false
  return Boolean(stdin.isTTY && stdout.isTTY)
}

function parseOrigin(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, origin: DEFAULT_ORIGIN }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'URL must start with http:// or https://' }
    }
    return { ok: true, origin: parsed.origin }
  } catch {
    return { ok: false, error: 'Enter a valid http(s) URL' }
  }
}

async function promptOrigin() {
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await rl.question(`Control plane URL [${DEFAULT_ORIGIN}]: `)
    return parseOrigin(answer)
  } finally {
    rl.close()
  }
}

function upsertEnvLine(existing, origin) {
  const line = `${ENV_KEY}=${origin}`
  const lines = existing.split('\n')
  let replaced = false
  const next = lines.map((entry) => {
    if (entry.startsWith(`${ENV_KEY}=`)) {
      replaced = true
      return line
    }
    return entry
  })
  if (!replaced) {
    if (next.length === 1 && next[0] === '') {
      return `${line}\n`
    }
    if (next.length > 0 && next[next.length - 1] !== '') {
      next.push('')
    }
    next.push(line)
    return `${next.join('\n').replace(/\n+$/, '\n')}`
  }
  return `${next.join('\n').replace(/\n+$/, '\n')}`
}

async function writeEnvOrigin(origin) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const envPath = path.join(root, ENV_FILE)
  const existing = existsSync(envPath) ? await readFile(envPath, 'utf8') : ''
  await writeFile(envPath, upsertEnvLine(existing, origin), 'utf8')
}

async function main() {
  const extraArgs = process.argv.slice(2)
  if (shouldPrompt()) {
    const parsed = await promptOrigin()
    if (!parsed.ok) {
      console.error(parsed.error)
      process.exit(1)
    }
    process.env.EXPO_PUBLIC_CONTROL_PLANE_URL = parsed.origin
    await writeEnvOrigin(parsed.origin)
  }

  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const expoBin = path.join(root, 'node_modules', '.bin', 'expo')
  const child = spawn(expoBin, ['start', ...extraArgs], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  })
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

await main()
