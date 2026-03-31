#!/usr/bin/env node
import { TerrorServer } from './server.js'
import type { Provider, TerrorConfig } from './types.js'
import { resolve } from 'node:path'

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
  // Resolve provider packages relative to the monorepo structure
  // bin.js lives at packages/core/dist/bin.js, so packages/ is ../../
  const packagesDir = resolve(__dirname, '..', '..')

  for (const name of providers) {
    try {
      const providerPath = resolve(packagesDir, name, 'dist', 'index.js')
      const mod: any = await import(providerPath)

      if (name === 'gcp' && mod.GcpProvider) {
        const provider: Provider = new mod.GcpProvider({
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
