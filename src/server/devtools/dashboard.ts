import { SuperApp } from '../index.js'
import { SseLogger, type RequestLogEntry } from './sse-logger.js'
import { QueryInspector, type QueryEntry, type NPlusOneAlert } from './query-inspector.js'
import { CacheInspector } from './cache-inspector.js'
import { SSEHandler } from '../http/sse-handler.js'
import { Router } from '../router/index.js'
import type { Queue } from '../queue/index.js'
import { QueueMonitor } from '../queue/monitor.js'
import type { Cache } from '../cache/index.js'
import { DatabaseConnection } from '../database/connection.js'
import type { Middleware } from '../middleware/index.js'

const SECRET_PATTERN = /(?:secret|password|token|key|auth|credential|private|jwt|salt|hash|api_key|apikey)/i

export class DevToolsDashboard {
  readonly sseLogger: SseLogger
  readonly queryInspector: QueryInspector
  readonly cacheInspector: CacheInspector
  private app: SuperApp
  private queueMonitor: QueueMonitor | null = null
  private enabled = false

  constructor(app: SuperApp) {
    this.app = app
    this.sseLogger = new SseLogger()
    this.queryInspector = new QueryInspector()
    this.cacheInspector = new CacheInspector()
  }

  static isEnabled(): boolean {
    return process.env.SPEEXJS_DEBUG === 'true' || process.env.NODE_ENV === 'development'
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true

    if (!DevToolsDashboard.isEnabled()) return

    this.trackQueries()
    this.setupRequestTracking()
    this.setupQueueMonitor()
    this.setupCacheInspector()
    this.registerRoutes()

    this.app.onShutdown(() => {
      this.sseLogger.getSseHandler().close()
    })
  }

  private trackQueries(): void {
    const originalRaw = (DatabaseConnection as any).prototype?.raw
    if (originalRaw) {
      const self = this
      ;(DatabaseConnection as any).prototype.raw = async function (sql: string, bindings?: unknown[]) {
        const start = Date.now()
        try {
          return await originalRaw.call(this, sql, bindings)
        } finally {
          self.queryInspector.track(sql, Date.now() - start, bindings)
        }
      }
    }
  }

  private setupRequestTracking(): void {
    const self = this
    const trackingMiddleware: Middleware = async (ctx, next) => {
      const start = Date.now()
      try {
        await next()
      } finally {
        const duration = Date.now() - start
        const authHeader = ctx.request.headers?.get?.('authorization') || ''
        let authType = 'None'
        if (authHeader.startsWith('Bearer ')) authType = 'Bearer'
        else if (authHeader.startsWith('Basic ')) authType = 'Basic'
        const queryCount = self.queryInspector.getStats().total

        self.sseLogger.track({
          method: ctx.request.method || 'GET',
          path: ctx.request.path || '/',
          status: ctx.response.statusCode || 200,
          duration,
          authType,
          queryCount,
          timestamp: Date.now(),
        })
      }
    }

    this.app.use(trackingMiddleware)
  }

  private setupQueueMonitor(): void {
    const monitor = new QueueMonitor()
    try {
      const queue = this.app.container.resolve<Queue>('queue')
      if (queue) {
        monitor.attach(queue, 'default')
      }
    } catch {
      /* no queue registered */
    }
    this.queueMonitor = monitor
  }

  private setupCacheInspector(): void {
    try {
      const cache = this.app.container.resolve<Cache>('cache')
      if (cache) {
        this.cacheInspector.setCache(cache)
      }
    } catch {
      /* no cache registered */
    }
  }

  private registerRoutes(): void {
    const router = this.app.router
    const self = this

    router.get('/_speex/devtools', async (ctx) => {
      ctx.response.html(self.getDashboardHtml())
    })

    router.get('/_speex/devtools/stream', async (ctx) => {
      const raw = ctx.response.rawResponse
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      self.sseLogger.getSseHandler().addClient(raw)

      const recent = self.sseLogger.getRecent()
      raw.write(`event: init\ndata: ${JSON.stringify(recent)}\n\n`)

      ;(ctx.response as any)._sent = true
    })

    router.get('/_speex/devtools/api/queries', async (ctx) => {
      const slowThreshold = parseInt(ctx.request.query?.slowThreshold as string || '100', 10)
      ctx.response.json({
        queries: self.queryInspector.getRecentQueries(100),
        slowQueries: self.queryInspector.getSlowQueries(slowThreshold),
        nPlusOneAlerts: self.queryInspector.getNPlusOneAlerts(),
        stats: self.queryInspector.getStats(),
      })
    })

    router.get('/_speex/devtools/api/cache', async (ctx) => {
      const keys = await self.cacheInspector.getKeys()
      ctx.response.json({
        stats: self.cacheInspector.getStats(),
        keys,
        perKeyHits: Object.fromEntries(self.cacheInspector.getPerKeyHits()),
      })
    })

    router.post('/_speex/devtools/api/cache/clear', async (ctx) => {
      await self.cacheInspector.clearAll()
      ctx.response.json({ ok: true })
    })

    router.post('/_speex/devtools/api/cache/delete', async (ctx) => {
      const body = await ctx.request.json() as { key?: string }
      if (body.key) {
        const ok = await self.cacheInspector.clearKey(body.key)
        ctx.response.json({ ok })
      } else {
        ctx.response.status(400).json({ error: 'Missing key' })
      }
    })

    router.get('/_speex/devtools/api/routes', async (ctx) => {
      const routes = self.app.router.getRoutes().map(r => ({
        method: r.methods[0] || 'GET',
        path: r.path,
        methods: r.methods,
        middlewareCount: r.middleware.length,
        name: r.name || null,
      }))
      ctx.response.json({ routes, total: routes.length })
    })

    router.get('/_speex/devtools/api/test-route', async (ctx) => {
      const method = (ctx.request.query?.method as string || 'GET').toUpperCase()
      const path = ctx.request.query?.path as string || '/'
      const start = Date.now()
      let status = 404
      let duration = 0
      try {
        const resolved = self.app.router.resolve(method, path)
        if (resolved) {
          status = 200
        }
      } catch {
        status = 500
      }
      duration = Date.now() - start
      ctx.response.json({ method, path, status, duration })
    })

    router.get('/_speex/devtools/api/queues', async (ctx) => {
      const monitor = self.queueMonitor
      if (!monitor) {
        ctx.response.json({ queues: [], stats: { processed: 0, failed: 0, pending: 0, queues: 0 }, jobs: [] })
        return
      }
      ctx.response.json({
        queues: monitor.getQueueStats(),
        stats: monitor.getStats(),
        jobs: monitor.getJobs({ limit: 50 }),
      })
    })

    router.post('/_speex/devtools/api/queues/retry', async (ctx) => {
      const body = await ctx.request.json() as { jobId?: string }
      const monitor = self.queueMonitor
      if (!monitor) {
        ctx.response.status(400).json({ error: 'No queue monitor' })
        return
      }
      if (body.jobId) {
        const ok = monitor.retryJob(body.jobId)
        ctx.response.json({ ok })
      } else {
        const count = monitor.retryAllFailed()
        ctx.response.json({ ok: true, retried: count })
      }
    })

    router.get('/_speex/devtools/api/env', async (ctx) => {
      const search = (ctx.request.query?.search as string || '').toLowerCase()
      const vars = Object.entries(process.env)
        .filter(([key]) => !search || key.toLowerCase().includes(search))
        .map(([key, value]) => ({
          key,
          value: SECRET_PATTERN.test(key) ? maskValue(value || '') : (value || ''),
          isSecret: SECRET_PATTERN.test(key),
          isSet: !!value,
        }))
        .sort((a, b) => a.key.localeCompare(b.key))

      ctx.response.json({ vars, total: vars.length })
    })
  }

  getDashboardHtml(): string {
    return generateHtml()
  }
}

function maskValue(value: string): string {
  if (value.length <= 4) return '****'
  return value.slice(0, 2) + '****' + value.slice(-2)
}

function generateHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SpeexJS DevTools</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0d1117;color:#c9d1d9;overflow-y:scroll}
  .wrap{max-width:1400px;margin:0 auto;padding:1.5rem}
  header{border-bottom:1px solid #30363d;padding-bottom:1rem;margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem}
  header h1{font-size:1.5rem;color:#f0f6fc;display:flex;align-items:center;gap:0.75rem}
  header h1 span{background:#1f6feb22;color:#58a6ff;font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:4px;font-weight:600}
  .status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:0.4rem}
  .status-dot.online{background:#3fb950;box-shadow:0 0 6px #3fb95066}
  .status-dot.offline{background:#f85149}
  .tabs{display:flex;gap:0;border-bottom:1px solid #30363d;margin-bottom:1.5rem;overflow-x:auto}
  .tab{padding:0.6rem 1.2rem;cursor:pointer;color:#8b949e;font-size:0.85rem;font-weight:500;border-bottom:2px solid transparent;white-space:nowrap;user-select:none;transition:color 0.15s,border-color 0.15s}
  .tab:hover{color:#e1e4e8}
  .tab.active{color:#f0f6fc;border-bottom-color:#58a6ff}
  .tab .badge{display:inline-block;background:#30363d;color:#c9d1d9;font-size:0.65rem;padding:0.1rem 0.4rem;border-radius:8px;margin-left:0.3rem;vertical-align:middle}
  .tab .badge.alert{background:#f8514922;color:#f85149}
  .tab-content{display:none}
  .tab-content.active{display:block}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem}
  .stat{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem}
  .stat .lbl{font-size:0.7rem;color:#8b949e;text-transform:uppercase;letter-spacing:0.05em}
  .stat .val{font-size:1.4rem;font-weight:700;color:#f0f6fc;margin-top:0.25rem}
  .stat .sub{font-size:0.75rem;color:#8b949e;margin-top:0.25rem}
  .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.25rem;margin-bottom:1rem}
  .card h3{font-size:0.95rem;color:#f0f6fc;margin-bottom:0.75rem;display:flex;align-items:center;justify-content:space-between}
  table{width:100%;border-collapse:collapse;font-size:0.85rem}
  th{text-align:left;padding:0.45rem 0.6rem;color:#8b949e;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #21262d;white-space:nowrap}
  td{padding:0.45rem 0.6rem;border-bottom:1px solid #21262d;vertical-align:middle}
  tr:hover td{background:#1c2128}
  .mono{font-family:'JetBrains Mono','Fira Code','Cascadia Code',Consolas,monospace;font-size:0.78rem}
  .muted{color:#8b949e}
  .right{text-align:right}
  .nowrap{white-space:nowrap}
  .break{word-break:break-all;max-width:400px}
  .method-badge{display:inline-block;padding:0.1rem 0.4rem;border-radius:3px;font-weight:600;font-size:0.7rem;min-width:3.5rem;text-align:center}
  .status-badge{display:inline-block;padding:0.1rem 0.5rem;border-radius:3px;font-weight:600;font-size:0.7rem}
  .status-2xx{background:#3fb95022;color:#3fb950}
  .status-3xx{background:#d2992222;color:#d29922}
  .status-4xx{background:#58a6ff22;color:#58a6ff}
  .status-5xx{background:#f8514922;color:#f85149}
  .alert-box{background:#f8514911;border:1px solid #f8514933;border-radius:6px;padding:0.75rem 1rem;margin-bottom:0.75rem;display:flex;align-items:center;gap:0.75rem}
  .alert-box.warn{background:#d2992211;border-color:#d2992233}
  .alert-box .icon{font-size:1.2rem}
  .btn{display:inline-flex;align-items:center;padding:0.3rem 0.75rem;border-radius:6px;font-size:0.78rem;background:#21262d;color:#c9d1d9;border:1px solid #30363d;cursor:pointer;gap:0.35rem;transition:background 0.15s}
  .btn:hover{background:#30363d}
  .btn.danger{color:#f85149;border-color:#f8514944}
  .btn.danger:hover{background:#f8514911}
  .btn.primary{background:#1f6feb;border-color:#1f6feb;color:#fff}
  .btn.primary:hover{background:#388bfd}
  .btn:disabled{opacity:0.5;cursor:not-allowed}
  .input{background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;padding:0.4rem 0.6rem;font-size:0.85rem;width:100%}
  .input:focus{outline:none;border-color:#58a6ff}
  .select{background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;padding:0.4rem 0.6rem;font-size:0.85rem}
  .toolbar{display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem}
  .toolbar .spacer{flex:1}
  .empty-state{text-align:center;padding:2rem;color:#8b949e;font-size:0.9rem}
  .json-preview{font-size:0.75rem;color:#8b949e;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
  .json-preview:hover{color:#e1e4e8}
  .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100;align-items:center;justify-content:center}
  .modal-overlay.show{display:flex}
  .modal{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;max-width:600px;width:90%;max-height:80vh;overflow:auto}
  .modal h3{font-size:1rem;margin-bottom:0.75rem}
  .modal pre{background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:0.75rem;font-size:0.75rem;overflow:auto;max-height:300px;margin-bottom:0.75rem}
  .modal .close{float:right;cursor:pointer;color:#8b949e;font-size:1.2rem}
  .modal .close:hover{color:#f0f6fc}
  .env-key{font-weight:600}
  .env-secret{color:#d29922}
  .env-safe{color:#3fb950}
  .progress-ring{display:inline-flex;align-items:center;gap:0.5rem}
  .progress-ring svg{transform:rotate(-90deg)}
  .hit-rate-circle{width:60px;height:60px}
  .payload-viewer{max-height:200px;overflow:auto;background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:0.5rem;font-size:0.75rem;white-space:pre-wrap;font-family:monospace;display:none}
  .highlight{background:#d2992222;padding:0.1rem 0.3rem;border-radius:3px}
  .slow-query{color:#f85149}
  @media(max-width:768px){.wrap{padding:0.75rem}.tab{padding:0.5rem 0.75rem;font-size:0.8rem}.grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>
    <span class="status-dot online" id="connDot"></span>
    SpeexJS DevTools
    <span>v1</span>
  </h1>
  <div style="font-size:0.8rem;color:#8b949e">
    <span id="connStatus">Connected</span>
    &middot;
    <span id="uptimeDisplay">-</span>
  </div>
</header>

<div class="tabs" id="tabBar">
  <div class="tab active" data-tab="requests">Request Log</div>
  <div class="tab" data-tab="queries">Queries <span class="badge" id="queryBadge">0</span></div>
  <div class="tab" data-tab="cache">Cache <span class="badge" id="cacheBadge">0</span></div>
  <div class="tab" data-tab="routes">Routes <span class="badge" id="routeBadge">0</span></div>
  <div class="tab" data-tab="queues">Jobs <span class="badge" id="queueBadge">0</span></div>
  <div class="tab" data-tab="env">Env Vars</div>
</div>

<div class="tab-content active" id="tab-requests">
  <div class="toolbar">
    <button class="btn" onclick="clearRequests()">Clear</button>
    <span style="font-size:0.8rem;color:#8b949e" id="reqCount">0 requests</span>
    <span class="spacer"></span>
    <label style="font-size:0.8rem;color:#8b949e"><input type="checkbox" id="autoScroll" checked> Auto-scroll</label>
  </div>
  <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Duration</th><th>Auth</th><th>Queries</th></tr></thead>
      <tbody id="requestLogBody"><tr><td colspan="7" class="empty-state">Waiting for requests...</td></tr></tbody>
    </table>
  </div>
</div>

<div class="tab-content" id="tab-queries">
  <div class="grid">
    <div class="stat"><div class="lbl">Total</div><div class="val" id="qTotal">0</div></div>
    <div class="stat"><div class="lbl">Slow (>100ms)</div><div class="val" style="color:#f85149" id="qSlow">0</div></div>
    <div class="stat"><div class="lbl">Avg Duration</div><div class="val" id="qAvg">0ms</div></div>
    <div class="stat"><div class="lbl">N+1 Alerts</div><div class="val" style="color:#d29922" id="qN1">0</div></div>
  </div>
  <div id="nPlusOneAlerts"></div>
  <div class="toolbar">
    <button class="btn" onclick="refreshQueries()">Refresh</button>
    <button class="btn danger" onclick="clearQueries()">Clear</button>
    <span class="spacer"></span>
    <label style="font-size:0.8rem;color:#8b949e">Slow threshold: <input type="number" id="slowThreshold" value="100" style="width:60px;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;padding:0.2rem 0.4rem;font-size:0.8rem"></label>
  </div>
  <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Time</th><th>SQL</th><th>Bindings</th><th style="text-align:right">Duration</th></tr></thead>
      <tbody id="queryBody"><tr><td colspan="4" class="empty-state">No queries yet</td></tr></tbody>
    </table>
  </div>
</div>

<div class="tab-content" id="tab-cache">
  <div class="grid">
    <div class="stat"><div class="lbl">Hit Rate</div><div class="val" id="cHitRate">0%</div></div>
    <div class="stat"><div class="lbl">Hits</div><div class="val" id="cHits">0</div></div>
    <div class="stat"><div class="lbl">Misses</div><div class="val" id="cMisses">0</div></div>
    <div class="stat"><div class="lbl">Total Keys</div><div class="val" id="cKeys">0</div><div class="sub" id="cSize">0 B</div></div>
  </div>
  <div class="toolbar">
    <button class="btn" onclick="refreshCache()">Refresh</button>
    <button class="btn danger" onclick="clearAllCache()">Clear All</button>
  </div>
  <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Key</th><th>Size</th><th>TTL Remaining</th><th>Expired</th><th></th></tr></thead>
      <tbody id="cacheBody"><tr><td colspan="5" class="empty-state">No cache entries</td></tr></tbody>
    </table>
  </div>
</div>

<div class="tab-content" id="tab-routes">
  <div class="toolbar">
    <button class="btn" onclick="refreshRoutes()">Refresh</button>
    <span style="font-size:0.8rem;color:#8b949e" id="routeCount">0 routes</span>
    <span class="spacer"></span>
  </div>
  <div class="card">
    <h3>Test Route</h3>
    <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
      <select class="select" id="testMethod">
        <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
      </select>
      <input class="input" id="testPath" placeholder="/api/..." style="flex:1;min-width:200px">
      <button class="btn primary" onclick="testRoute()">Send</button>
    </div>
    <div id="testResult" style="margin-top:0.5rem;font-size:0.8rem;color:#8b949e"></div>
  </div>
  <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Method</th><th>Path</th><th>Middleware</th><th>Name</th></tr></thead>
      <tbody id="routeBody"><tr><td colspan="4" class="empty-state">No routes</td></tr></tbody>
    </table>
  </div>
</div>

<div class="tab-content" id="tab-queues">
  <div class="grid">
    <div class="stat"><div class="lbl">Processed</div><div class="val" style="color:#3fb950" id="jProcessed">0</div></div>
    <div class="stat"><div class="lbl">Failed</div><div class="val" style="color:#f85149" id="jFailed">0</div></div>
    <div class="stat"><div class="lbl">Pending</div><div class="val" style="color:#d29922" id="jPending">0</div></div>
    <div class="stat"><div class="lbl">Queues</div><div class="val" id="jQueues">0</div></div>
  </div>
  <div class="toolbar">
    <button class="btn" onclick="refreshQueues()">Refresh</button>
    <button class="btn" onclick="retryAllFailed()">Retry All Failed</button>
  </div>
  <h3 style="color:#f0f6fc;font-size:0.95rem;margin-bottom:0.5rem">Queues</h3>
  <div style="overflow-x:auto;margin-bottom:1rem">
    <table>
      <thead><tr><th>Queue</th><th style="text-align:right">Waiting</th><th style="text-align:right">Running</th><th style="text-align:right">Completed</th><th style="text-align:right">Failed</th></tr></thead>
      <tbody id="queueTableBody"><tr><td colspan="5" class="empty-state">No queues active</td></tr></tbody>
    </table>
  </div>
  <h3 style="color:#f0f6fc;font-size:0.95rem;margin-bottom:0.5rem">Recent Jobs</h3>
  <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Status</th><th>Name</th><th>Queue</th><th>Attempts</th><th>Payload</th><th>Created</th></tr></thead>
      <tbody id="jobTableBody"><tr><td colspan="6" class="empty-state">No jobs</td></tr></tbody>
    </table>
  </div>
</div>

<div class="tab-content" id="tab-env">
  <div class="toolbar">
    <input class="input" id="envSearch" placeholder="Search env vars..." style="max-width:300px" oninput="filterEnv()">
    <span style="font-size:0.8rem;color:#8b949e" id="envCount">0 vars</span>
    <span class="spacer"></span>
    <button class="btn" onclick="refreshEnv()">Refresh</button>
  </div>
  <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Variable</th><th>Value</th><th>Status</th></tr></thead>
      <tbody id="envBody"><tr><td colspan="3" class="empty-state">Loading...</td></tr></tbody>
    </table>
  </div>
</div>
</div>

<div class="modal-overlay" id="payloadModal">
  <div class="modal">
    <span class="close" onclick="closePayloadModal()">&times;</span>
    <h3 id="payloadModalTitle">Payload</h3>
    <pre id="payloadModalContent"></pre>
    <button class="btn" onclick="closePayloadModal()">Close</button>
  </div>
</div>

<script>
(function(){
  let requests = [];
  let queryData = { queries: [], slowQueries: [], nPlusOneAlerts: [], stats: { total: 0, slowCount: 0, avgDuration: 0, nPlusOneCount: 0 } };
  let cacheData = { stats: { hits: 0, misses: 0, keys: 0, size: '0 B', hitRate: 0 }, keys: [], perKeyHits: {} };
  let routeData = { routes: [], total: 0 };
  let queueData = { queues: [], stats: { processed: 0, failed: 0, pending: 0, queues: 0 }, jobs: [] };
  let envData = { vars: [], total: 0 };

  const methodColors = { GET: '#1f6feb', POST: '#238636', PUT: '#d29922', PATCH: '#d29922', DELETE: '#f85149', OPTIONS: '#8b949e', HEAD: '#8b949e' };

  function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

  function statusClass(code) {
    if (code >= 200 && code < 300) return 'status-2xx'
    if (code >= 300 && code < 400) return 'status-3xx'
    if (code >= 400 && code < 500) return 'status-4xx'
    return 'status-5xx'
  }

  function formatDuration(ms) {
    if (ms >= 1000) return (ms/1000).toFixed(2)+'s'
    if (ms >= 1) return ms.toFixed(0)+'ms'
    return (ms*1000).toFixed(0)+'\\u00b5s'
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString()
  }

  function truncateSql(sql, len) {
    len = len || 120
    return sql.length > len ? sql.slice(0, len) + '...' : sql
  }

  // --- Tabs ---
  document.getElementById('tabBar').addEventListener('click', function(e) {
    const tab = e.target.closest('.tab')
    if (!tab) return
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active')
    if (tab.dataset.tab === 'queries') refreshQueries()
    if (tab.dataset.tab === 'cache') refreshCache()
    if (tab.dataset.tab === 'routes') refreshRoutes()
    if (tab.dataset.tab === 'queues') refreshQueues()
    if (tab.dataset.tab === 'env') refreshEnv()
  })

  // --- SSE ---
  let connected = false
  function connectSSE() {
    const es = new EventSource('/_speex/devtools/stream')
    es.addEventListener('init', function(e) {
      connected = true
      document.getElementById('connDot').className = 'status-dot online'
      document.getElementById('connStatus').textContent = 'Connected'
      try { requests = JSON.parse(e.data); renderRequests() } catch {}
    })
    es.addEventListener('request', function(e) {
      try {
        const req = JSON.parse(e.data)
        requests.unshift(req)
        if (requests.length > 100) requests.pop()
        renderRequests()
      } catch {}
    })
    es.onerror = function() {
      connected = false
      document.getElementById('connDot').className = 'status-dot offline'
      document.getElementById('connStatus').textContent = 'Disconnected'
      setTimeout(connectSSE, 3000)
    }
  }
  connectSSE()

  // --- Request Log ---
  function renderRequests() {
    const body = document.getElementById('requestLogBody')
    if (requests.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">Waiting for requests...</td></tr>'
      document.getElementById('reqCount').textContent = '0 requests'
      return
    }
    const autoScroll = document.getElementById('autoScroll').checked
    document.getElementById('reqCount').textContent = requests.length + ' requests'
    body.innerHTML = requests.map(r => {
      const mColor = methodColors[r.method] || '#8b949e'
      return '<tr><td class="muted nowrap mono">'+formatTime(r.timestamp)+'</td>' +
        '<td><span class="method-badge" style="background:'+mColor+'22;color:'+mColor+'">'+escapeHtml(r.method)+'</span></td>' +
        '<td class="mono break">'+escapeHtml(r.path)+'</td>' +
        '<td><span class="status-badge '+statusClass(r.status)+'">'+r.status+'</span></td>' +
        '<td class="mono right">'+formatDuration(r.duration)+'</td>' +
        '<td class="mono" style="color:#8b949e">'+escapeHtml(r.authType)+'</td>' +
        '<td class="mono right">'+r.queryCount+'</td></tr>'
    }).join('')
  }

  window.clearRequests = function() {
    requests = []
    renderRequests()
  }

  // --- Queries ---
  window.refreshQueries = function() {
    const threshold = document.getElementById('slowThreshold').value || 100
    fetch('/_speex/devtools/api/queries?slowThreshold='+threshold).then(r => r.json()).then(d => {
      queryData = d
      renderQueries()
    })
  }

  window.clearQueries = function() {
    queryData = { queries: [], slowQueries: [], nPlusOneAlerts: [], stats: { total: 0, slowCount: 0, avgDuration: 0, nPlusOneCount: 0 } }
    renderQueries()
  }

  function renderQueries() {
    const q = queryData.queries || []
    const s = queryData.stats || { total: 0, slowCount: 0, avgDuration: 0, nPlusOneCount: 0 }
    const alerts = queryData.nPlusOneAlerts || []

    document.getElementById('qTotal').textContent = s.total
    document.getElementById('qSlow').textContent = s.slowCount
    document.getElementById('qAvg').textContent = s.avgDuration + 'ms'
    document.getElementById('qN1').textContent = s.nPlusOneCount
    document.getElementById('queryBadge').textContent = s.total

    const alertContainer = document.getElementById('nPlusOneAlerts')
    if (alerts.length > 0) {
      alertContainer.innerHTML = alerts.map(a =>
        '<div class="alert-box warn"><span class="icon">\\u26a0\\ufe0f</span><div><strong>N+1 Detected</strong> &mdash; Pattern "'+escapeHtml(a.pattern.slice(0,60))+'..." appeared <strong>'+a.count+'</strong> times<br><span class="mono" style="font-size:0.75rem;color:#8b949e">Sample: '+escapeHtml(truncateSql(a.sampleSql, 80))+'</span></div></div>'
      ).join('')
    } else {
      alertContainer.innerHTML = ''
    }

    const body = document.getElementById('queryBody')
    if (q.length === 0) {
      body.innerHTML = '<tr><td colspan="4" class="empty-state">No queries yet</td></tr>'
      return
    }

    body.innerHTML = q.map(e => {
      const dc = e.duration > 100 ? '#f85149' : e.duration > 30 ? '#d29922' : '#3fb950'
      const bindings = e.bindings && e.bindings.length > 0 ? escapeHtml(JSON.stringify(e.bindings)) : '-'
      return '<tr><td class="muted nowrap mono">'+formatTime(e.timestamp)+'</td>' +
        '<td class="mono break '+(e.duration>100?'slow-query':'')+'">'+escapeHtml(truncateSql(e.sql))+'</td>' +
        '<td class="mono" style="font-size:0.7rem;color:#8b949e">'+bindings+'</td>' +
        '<td class="mono right" style="color:'+dc+'">'+formatDuration(e.duration)+'</td></tr>'
    }).join('')
  }

  // --- Cache ---
  window.refreshCache = function() {
    fetch('/_speex/devtools/api/cache').then(r => r.json()).then(d => {
      cacheData = d
      renderCache()
    })
  }

  window.clearAllCache = function() {
    if (!confirm('Clear all cache entries?')) return
    fetch('/_speex/devtools/api/cache/clear', { method: 'POST' }).then(r => r.json()).then(() => refreshCache())
  }

  window.deleteCacheKey = function(key) {
    fetch('/_speex/devtools/api/cache/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })
      .then(r => r.json()).then(() => refreshCache())
  }

  function renderCache() {
    const s = cacheData.stats || { hits: 0, misses: 0, keys: 0, size: '0 B', hitRate: 0 }
    const keys = cacheData.keys || []
    document.getElementById('cHitRate').textContent = s.hitRate + '%'
    document.getElementById('cHits').textContent = s.hits
    document.getElementById('cMisses').textContent = s.misses
    document.getElementById('cKeys').textContent = s.keys
    document.getElementById('cSize').textContent = s.size
    document.getElementById('cacheBadge').textContent = s.keys

    const body = document.getElementById('cacheBody')
    if (keys.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">No cache entries</td></tr>'
      return
    }
    body.innerHTML = keys.map(k => {
      const ttl = k.ttlRemaining > 0 ? formatDuration(k.ttlRemaining) : 'Expired'
      const expired = k.expired ? '<span style="color:#f85149">Yes</span>' : '<span style="color:#3fb950">No</span>'
      return '<tr><td class="mono break">'+escapeHtml(k.key)+'</td>' +
        '<td class="mono">'+k.estimatedSizeFormatted+'</td>' +
        '<td class="mono">'+ttl+'</td>' +
        '<td>'+expired+'</td>' +
        '<td><button class="btn danger" style="padding:0.15rem 0.5rem;font-size:0.7rem" onclick="deleteCacheKey(\''+escapeHtml(k.key).replace(/'/g,"\\'")+'\')">Delete</button></td></tr>'
    }).join('')
  }

  // --- Routes ---
  window.refreshRoutes = function() {
    fetch('/_speex/devtools/api/routes').then(r => r.json()).then(d => {
      routeData = d
      renderRoutes()
    })
  }

  function renderRoutes() {
    const routes = routeData.routes || []
    const total = routeData.total || 0
    document.getElementById('routeCount').textContent = total + ' routes'
    document.getElementById('routeBadge').textContent = total

    const body = document.getElementById('routeBody')
    if (routes.length === 0) {
      body.innerHTML = '<tr><td colspan="4" class="empty-state">No routes</td></tr>'
      return
    }
    body.innerHTML = routes.map(r => {
      const mColor = methodColors[r.method] || '#8b949e'
      return '<tr><td><span class="method-badge" style="background:'+mColor+'22;color:'+mColor+'">'+escapeHtml(r.method)+'</span></td>' +
        '<td class="mono break">'+escapeHtml(r.path)+'</td>' +
        '<td class="mono">'+r.middlewareCount+' middleware</td>' +
        '<td class="mono muted">'+(r.name ? escapeHtml(r.name) : '-')+'</td></tr>'
    }).join('')
  }

  window.testRoute = function() {
    const method = document.getElementById('testMethod').value
    const path = document.getElementById('testPath').value || '/'
    const result = document.getElementById('testResult')
    result.textContent = 'Testing...'
    fetch('/_speex/devtools/api/test-route?method='+encodeURIComponent(method)+'&path='+encodeURIComponent(path))
      .then(r => r.json()).then(d => {
        result.innerHTML = 'Route <strong>'+escapeHtml(d.method)+' '+escapeHtml(d.path)+'</strong> — ' +
          (d.status === 200 ? '<span style="color:#3fb950">Found</span>' : '<span style="color:#f85149">Not Found</span>') +
          ' ('+d.duration+'ms)'
      }).catch(e => { result.textContent = 'Error: '+e.message })
  }

  // --- Queues ---
  window.refreshQueues = function() {
    fetch('/_speex/devtools/api/queues').then(r => r.json()).then(d => {
      queueData = d
      renderQueues()
    })
  }

  window.retryAllFailed = function() {
    fetch('/_speex/devtools/api/queues/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(r => r.json()).then(() => refreshQueues())
  }

  window.retryJob = function(jobId) {
    fetch('/_speex/devtools/api/queues/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }) })
      .then(r => r.json()).then(() => refreshQueues())
  }

  window.showPayload = function(title, payload) {
    document.getElementById('payloadModal').classList.add('show')
    document.getElementById('payloadModalTitle').textContent = title
    document.getElementById('payloadModalContent').textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  }

  window.closePayloadModal = function() {
    document.getElementById('payloadModal').classList.remove('show')
  }

  function renderQueues() {
    const s = queueData.stats || { processed: 0, failed: 0, pending: 0, queues: 0 }
    const queues = queueData.queues || []
    const jobs = queueData.jobs || []

    document.getElementById('jProcessed').textContent = s.processed
    document.getElementById('jFailed').textContent = s.failed
    document.getElementById('jPending').textContent = s.pending
    document.getElementById('jQueues').textContent = s.queues
    document.getElementById('queueBadge').textContent = s.pending

    const qBody = document.getElementById('queueTableBody')
    if (queues.length === 0) {
      qBody.innerHTML = '<tr><td colspan="5" class="empty-state">No queues active</td></tr>'
    } else {
      qBody.innerHTML = queues.map(q =>
        '<tr><td><strong>'+escapeHtml(q.queueName)+'</strong></td>' +
        '<td class="mono right">'+q.waiting+'</td>' +
        '<td class="mono right">'+q.running+'</td>' +
        '<td class="mono right" style="color:#3fb950">'+q.completed+'</td>' +
        '<td class="mono right" style="color:#f85149">'+q.failed+'</td></tr>'
      ).join('')
    }

    const jBody = document.getElementById('jobTableBody')
    if (jobs.length === 0) {
      jBody.innerHTML = '<tr><td colspan="6" class="empty-state">No jobs</td></tr>'
    } else {
      jBody.innerHTML = jobs.map(j => {
        const badgeClass = j.status === 'failed' ? 'status-5xx' : j.status === 'completed' ? 'status-2xx' : j.status === 'running' ? 'status-4xx' : 'status-3xx'
        const payloadStr = JSON.stringify(j.payload || {})
        const payloadPreview = payloadStr.length > 60 ? payloadStr.slice(0,60)+'...' : payloadStr
        return '<tr><td><span class="status-badge '+badgeClass+'">'+escapeHtml(j.status)+'</span></td>' +
          '<td class="mono">'+escapeHtml(j.name)+'</td>' +
          '<td class="mono muted">'+escapeHtml(j.queue)+'</td>' +
          '<td class="mono">'+j.attempts+'/'+j.maxAttempts+(j.error ? '<br><span style="font-size:0.7rem;color:#f85149;cursor:pointer" onclick="showPayload(\'Error: '+escapeHtml(j.name)+'\',\''+escapeHtml(j.error).replace(/'/g,"\\'")+'\')">View Error</span>' : '')+'</td>' +
          '<td><span class="json-preview" onclick="showPayload(\'Payload: '+escapeHtml(j.name)+'\', '+escapeHtml(JSON.stringify(j.payload||{}))+')">'+escapeHtml(payloadPreview)+'</span></td>' +
          '<td class="muted" style="font-size:0.75rem">'+new Date(j.createdAt).toLocaleString()+'</td>' +
          (j.status === 'failed' ? '<td><button class="btn" style="padding:0.15rem 0.5rem;font-size:0.7rem" onclick="retryJob(\''+escapeHtml(j.id)+'\')">Retry</button></td>' : '<td></td>')+'</tr>'
      }).join('')
    }
  }

  // --- Env ---
  window.refreshEnv = function() {
    const search = document.getElementById('envSearch').value
    fetch('/_speex/devtools/api/env' + (search ? '?search='+encodeURIComponent(search) : ''))
      .then(r => r.json()).then(d => {
        envData = d
        renderEnv()
      })
  }

  window.filterEnv = function() {
    refreshEnv()
  }

  function renderEnv() {
    const vars = envData.vars || []
    document.getElementById('envCount').textContent = vars.length + ' vars'

    const body = document.getElementById('envBody')
    if (vars.length === 0) {
      body.innerHTML = '<tr><td colspan="3" class="empty-state">No matching env vars</td></tr>'
      return
    }
    body.innerHTML = vars.map(v =>
      '<tr><td class="mono env-key '+(v.isSecret?'env-secret':'env-safe')+'">'+escapeHtml(v.key)+'</td>' +
      '<td class="mono'+(v.isSecret?' env-secret':'')+'">'+escapeHtml(v.value)+'</td>' +
      '<td>'+(v.isSet ? '<span style="color:#3fb950">&#10003;</span>' : '<span style="color:#f85149">&#10007;</span>')+'</td></tr>'
    ).join('')
  }

  // Auto-refresh
  let uptimeStart = Date.now()
  setInterval(function() {
    const elapsed = Math.floor((Date.now() - uptimeStart) / 1000)
    const d = Math.floor(elapsed / 86400)
    const h = Math.floor((elapsed % 86400) / 3600)
    const m = Math.floor((elapsed % 3600) / 60)
    document.getElementById('uptimeDisplay').textContent = (d > 0 ? d+'d ' : '') + h+'h '+m+'m'
  }, 5000)

  // Initial loads
  refreshQueries()
  refreshCache()
  refreshRoutes()
  refreshQueues()
  refreshEnv()
})();
</script>
</body>
</html>`
}
