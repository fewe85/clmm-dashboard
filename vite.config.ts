import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import os from 'os'

const BOT_STATE_FILES: Record<string, string> = {
  'thala': path.join(os.homedir(), 'claude-workspace/thala-bot/apt-usdc/state.json'),
  'rebalance-metrics': path.join(os.homedir(), 'claude-workspace/thala-bot/apt-usdc/logs/rebalance-metrics.jsonl'),
  'elon': path.join(os.homedir(), 'claude-workspace/thala-bot/elon-usdc/state.json'),
  'elon-rebalance-metrics': path.join(os.homedir(), 'claude-workspace/thala-bot/elon-usdc/logs/rebalance-metrics.jsonl'),
}

export default defineConfig({
  // Exclude public/api from file watching — bot writes state.json there every 60s,
  // which triggers Vite's full page reload on public/ changes.
  server: {
    watch: {
      ignored: ['**/public/api/**'],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'serve-bot-state',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? '').replace(/^\/clmm-dashboard\//, '/')

          // JSON state files
          const jsonMatch = url.match(/^\/api\/bot-state\/([\w-]+)\.json$/)
          if (jsonMatch && BOT_STATE_FILES[jsonMatch[1]]) {
            try {
              const data = fs.readFileSync(BOT_STATE_FILES[jsonMatch[1]], 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(data)
            } catch {
              res.statusCode = 404
              res.end('{}')
            }
            return
          }

          // JSONL metrics file
          const jsonlMatch = url.match(/^\/api\/bot-state\/([\w-]+)\.jsonl$/)
          if (jsonlMatch && BOT_STATE_FILES[jsonlMatch[1]]) {
            try {
              const data = fs.readFileSync(BOT_STATE_FILES[jsonlMatch[1]], 'utf-8')
              res.setHeader('Content-Type', 'text/plain')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(data)
            } catch {
              res.statusCode = 404
              res.end('')
            }
            return
          }

          next()
        })
      },
      closeBundle() {
        const outDir = path.resolve('dist/api/bot-state')
        fs.mkdirSync(outDir, { recursive: true })
        for (const [name, filePath] of Object.entries(BOT_STATE_FILES)) {
          try {
            const data = fs.readFileSync(filePath, 'utf-8')
            const ext = filePath.endsWith('.jsonl') ? 'jsonl' : 'json'
            fs.writeFileSync(path.join(outDir, `${name}.${ext}`), data)
          } catch { /* bot not running — skip */ }
        }
      },
    },
  ],
  base: '/clmm-dashboard/',
})
