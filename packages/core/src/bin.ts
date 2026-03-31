#!/usr/bin/env node
import { TerrorServer } from './server.js'
import type { TerrorConfig } from './types.js'

const providers = (process.env.TERROR_PROVIDERS ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)

const config: TerrorConfig = {
  providers: [],
  autoApply: process.env.TERROR_AUTO_APPLY === 'true',
  logLevel: (process.env.TERROR_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') ?? 'warn',
}

async function loadProviders() {
  for (const name of providers) {
    try {
      const pkg = `@terror/${name}`
      const mod: any = await import(pkg)
      if (name === 'gcp' && mod.GcpProvider) {
        const provider = new mod.GcpProvider({
          projectId: process.env.GCP_PROJECT_ID ?? '',
          region: process.env.GCP_REGION ?? 'us-central1',
        })
        config.providers.push(provider)
      }
    } catch (err) {
      console.error(`[terror] Failed to load provider "${name}":`, err)
    }
  }
}

async function main() {
  await loadProviders()
  const server = new TerrorServer(config)
  await server.start()
}

main().catch((err) => {
  console.error('[terror] Fatal error:', err)
  process.exit(1)
})
