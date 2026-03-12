import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import os from 'os'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'serve-bot-state',
      configureServer(server) {
        const stateFiles: Record<string, string> = {
          '/api/bot-state/turbos': path.join(os.homedir(), 'claude-workspace/turbos-bot/deep-usdc/state.json'),
          '/api/bot-state/wal': path.join(os.homedir(), 'claude-workspace/turbos-bot/wal-usdc/state.json'),
          '/api/bot-state/sui-turbos': path.join(os.homedir(), 'claude-workspace/turbos-bot/sui-turbos/state.json'),
          '/api/bot-state/thala': path.join(os.homedir(), 'claude-workspace/thala-bot/apt-usdc/state.json'),
          '/api/bot-state/elon': path.join(os.homedir(), 'claude-workspace/thala-bot/elon-usdc/state.json'),
        }
        server.middlewares.use((req, res, next) => {
          const filePath = stateFiles[req.url ?? '']
          if (filePath) {
            try {
              const data = fs.readFileSync(filePath, 'utf-8')
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
    },
  ],
  base: '/clmm-dashboard/',
})
