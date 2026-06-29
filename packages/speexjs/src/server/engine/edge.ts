export interface EdgeRequest { method: string; url: string; headers: Record<string, string>; body?: string }
export interface EdgeResponse { status: number; headers: Record<string, string>; body: string }

export class EdgeEngine {
  async handle(request: EdgeRequest, handler: (req: any, res: any) => Promise<void>): Promise<EdgeResponse> {
    const { SuperRequest } = await import('../http/request.js')
    const { SuperResponse } = await import('../http/response.js')
    const { IncomingMessage } = await import('node:http')
    const { Socket } = await import('node:net')

    const socket = new Socket()
    const msg = new IncomingMessage(socket)
    msg.method = request.method
    msg.url = request.url
    msg.headers = request.headers

    const req = new SuperRequest(msg as any)
    const res = new SuperResponse({ statusCode: 200, setHeader: () => {}, end: () => {} } as any)

    await handler(req, res)

    return { status: res.statusCode, headers: {}, body: String((res as any)._body ?? '') }
  }
}
