import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import os from 'os'

const BOT_STATE_FILES: Record<string, string> = {
  'turbos': path.join(os.homedir(), 'claude-workspace/turbos-bot/deep-usdc/state.json'),
  'wal': path.join(os.homedir(), 'claude-workspace/turbos-bot/wal-usdc/state.json'),
  'sui-turbos': path.join(os.homedir(), 'claude-workspace/turbos-bot/sui-turbos/state.json'),
  'thala': path.join(os.homedir(), 'claude-workspace/thala-bot/apt-usdc/state.json'),
  'elon': path.join(os.homedir(), 'claude-workspace/thala-bot/elon-usdc/state.json'),
  'ika': path.join(os.homedir(), 'claude-workspace/turbos-bot/ika-usdc/state.json'),
  'sui-usdc': path.join(os.homedir(), 'claude-workspace/turbos-bot/sui-usdc/state.json'),
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'serve-bot-state',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Strip base path prefix if present
          const url = (req.url ?? '').replace(/^\/clmm-dashboard\//, '/')
          const match = url.match(/^\/api\/bot-state\/([\w-]+)\.json$/)
          if (match && BOT_STATE_FILES[match[1]]) {
            try {
              const data = fs.readFileSync(BOT_STATE_FILES[match[1]], 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(data)
            } catch {
              res.statusCode = 404
              res.end('{}')
            }
            return
          }
          next()
        })
      },
      // Copy bot state snapshots into dist/ so GitHub Pages can serve them
      closeBundle() {
        const outDir = path.resolve('dist/api/bot-state')
        fs.mkdirSync(outDir, { recursive: true })
        for (const [name, filePath] of Object.entries(BOT_STATE_FILES)) {
          try {
            const data = fs.readFileSync(filePath, 'utf-8')
            fs.writeFileSync(path.join(outDir, `${name}.json`), data)
          } catch { /* bot not running — skip */ }
        }
      },
    },
  ],
  base: '/clmm-dashboard/',
})
