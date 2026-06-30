import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

export function activate(context: vscode.ExtensionContext) {
  console.log('SpeexJS Inspector is now active!')

  // ─── Route Explorer Tree Data Provider ───────────────────────

  class RouteNode extends vscode.TreeItem {
    constructor(
      public readonly label: string,
      public readonly collapsibleState: vscode.TreeItemCollapsibleState,
      public readonly route?: { method: string; path: string; handler: string },
      public readonly command?: vscode.Command,
    ) {
      super(label, collapsibleState)
      if (route) {
        this.description = `${route.method} ${route.path}`
        this.tooltip = `Handler: ${route.handler}`
        this.contextValue = 'route'
        this.iconPath = getMethodIcon(route.method)
      }
    }
  }

  class RouteExplorerProvider implements vscode.TreeDataProvider<RouteNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<RouteNode | undefined | void>()
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event

    refresh(): void {
      this._onDidChangeTreeData.fire()
    }

    getTreeItem(element: RouteNode): vscode.TreeItem {
      return element
    }

    getChildren(element?: RouteNode): Thenable<RouteNode[]> {
      if (element) {
        return Promise.resolve([])
      }
      return Promise.resolve(this.getRouteNodes())
    }

    private getRouteNodes(): RouteNode[] {
      const workspaceFolders = vscode.workspace.workspaceFolders
      if (!workspaceFolders) {
        return [new RouteNode('No workspace open', vscode.TreeItemCollapsibleState.None)]
      }

      const rootPath = workspaceFolders[0].uri.fsPath
      const routesDir = path.join(rootPath, 'src', 'routes')
      
      if (!fs.existsSync(routesDir)) {
        return [new RouteNode('No routes directory found (src/routes/)', vscode.TreeItemCollapsibleState.None)]
      }

      const nodes: RouteNode[] = []
      
      try {
        const files = fs.readdirSync(routesDir)
        for (const file of files) {
          const filePath = path.join(routesDir, file)
          const stat = fs.statSync(filePath)
          
          if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
            const routePath = '/' + file.replace(/\.(ts|tsx)$/, '').replace(/\[(\w+)\]/g, ':$1').replace(/\\/g, '/')
            const routeName = file.replace(/\.(ts|tsx)$/, '')
            
            nodes.push(new RouteNode(
              routeName,
              vscode.TreeItemCollapsibleState.None,
              {
                method: 'GET',
                path: routePath,
                handler: `routes/${file}`,
              },
              {
                command: 'vscode.open',
                title: 'Open file',
                arguments: [vscode.Uri.file(filePath)],
              },
            ))
          }
        }

        // Also check for speexjs.config.ts routes
        const configPath = path.join(rootPath, 'speexjs.config.ts')
        if (fs.existsSync(configPath)) {
          nodes.push(new RouteNode(
            'Config-based routes (speexjs.config.ts)',
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
          ))
          
          // Try to parse some basic route info from the config
          const configContent = fs.readFileSync(configPath, 'utf-8')
          if (configContent.includes('routes') || configContent.includes('router')) {
            nodes.push(new RouteNode(
              '  Check speexjs list-routes for full list',
              vscode.TreeItemCollapsibleState.None,
            ))
          }
        }
      } catch (err) {
        nodes.push(new RouteNode(`Error: ${err}`, vscode.TreeItemCollapsibleState.None))
      }

      return nodes.length > 0 ? nodes : [new RouteNode('No routes found', vscode.TreeItemCollapsibleState.None)]
    }
  }

  function getMethodIcon(method: string): vscode.ThemeIcon {
    switch (method) {
      case 'GET': return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.green'))
      case 'POST': return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.blue'))
      case 'PUT':
      case 'PATCH': return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.orange'))
      case 'DELETE': return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.red'))
      default: return new vscode.ThemeIcon('symbol-method')
    }
  }

  // ─── Register Tree View ─────────────────────────────────────

  const routeExplorerProvider = new RouteExplorerProvider()
  vscode.window.registerTreeDataProvider('speexjsRouteExplorer', routeExplorerProvider)

  // Quick Actions view
  class QuickActionNode extends vscode.TreeItem {
    constructor(
      public readonly label: string,
      public readonly command?: vscode.Command,
    ) {
      super(label, vscode.TreeItemCollapsibleState.None)
    }
  }

  class QuickActionsProvider implements vscode.TreeDataProvider<QuickActionNode> {
    getTreeItem(element: QuickActionNode): vscode.TreeItem {
      return element
    }

    getChildren(): Thenable<QuickActionNode[]> {
      return Promise.resolve([
        new QuickActionNode('🔧 Generate Controller', {
          command: 'speexjs.makeController',
          title: 'Generate Controller',
        }),
        new QuickActionNode('📦 Generate Model', {
          command: 'speexjs.makeModel',
          title: 'Generate Model',
        }),
        new QuickActionNode('🔐 Generate Auth', {
          command: 'speexjs.makeAuth',
          title: 'Generate Auth',
        }),
        new QuickActionNode('📋 Generate Resource', {
          command: 'speexjs.makeResource',
          title: 'Generate Resource',
        }),
        new QuickActionNode('🔄 Generate Middleware', {
          command: 'speexjs.makeMiddleware',
          title: 'Generate Middleware',
        }),
        new QuickActionNode('🗺️ Refresh Routes', {
          command: 'speexjs.listRoutes',
          title: 'Refresh Routes',
        }),
      ])
    }
  }

  vscode.window.registerTreeDataProvider('speexjsQuickActions', new QuickActionsProvider())

  // ─── Register Commands ──────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('speexjs.showRouteExplorer', () => {
      routeExplorerProvider.refresh()
      vscode.window.showInformationMessage('SpeexJS Route Explorer refreshed')
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('speexjs.makeController', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Controller name (e.g., UserController)',
        placeHolder: 'UserController',
      })
      if (name) {
        vscode.window.showInformationMessage(`Generating controller: ${name}`)
        const terminal = vscode.window.createTerminal('SpeexJS Generator')
        terminal.show()
        terminal.sendText(`npx speexjs make:controller ${name}`)
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('speexjs.makeModel', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Model name (e.g., User)',
        placeHolder: 'User',
      })
      if (name) {
        vscode.window.showInformationMessage(`Generating model: ${name}`)
        const terminal = vscode.window.createTerminal('SpeexJS Generator')
        terminal.show()
        terminal.sendText(`npx speexjs make:model ${name}`)
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('speexjs.makeAuth', async () => {
      const terminal = vscode.window.createTerminal('SpeexJS Generator')
      terminal.show()
      terminal.sendText('npx speexjs make:auth')
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('speexjs.makeResource', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Resource name (e.g., Post)',
        placeHolder: 'Post',
      })
      if (name) {
        vscode.window.showInformationMessage(`Generating resource: ${name}`)
        const terminal = vscode.window.createTerminal('SpeexJS Generator')
        terminal.show()
        terminal.sendText(`npx speexjs make:resource ${name}`)
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('speexjs.makeMiddleware', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Middleware name (e.g., AuthMiddleware)',
        placeHolder: 'AuthMiddleware',
      })
      if (name) {
        vscode.window.showInformationMessage(`Generating middleware: ${name}`)
        const terminal = vscode.window.createTerminal('SpeexJS Generator')
        terminal.show()
        terminal.sendText(`npx speexjs make:middleware ${name}`)
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('speexjs.listRoutes', () => {
      routeExplorerProvider.refresh()
      const terminal = vscode.window.createTerminal('SpeexJS Routes')
      terminal.show()
      terminal.sendText('npx speexjs list-routes')
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('speexjs.openDevDashboard', () => {
      vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000/_speex/dev'))
    }),
  )

  // ─── Status Bar Button ──────────────────────────────────────

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusBarItem.text = '$(symbol-method) SpeexJS'
  statusBarItem.tooltip = 'Click to open Route Explorer'
  statusBarItem.command = 'speexjs.showRouteExplorer'
  statusBarItem.show()
  context.subscriptions.push(statusBarItem)
}

export function deactivate() {}
