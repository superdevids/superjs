export type Resolver = (parent: unknown, args: Record<string, unknown>, ctx: unknown) => unknown

export class GraphQLSchema {
  private queryFields = new Map<string, { resolve: Resolver }>()

  query(name: string, resolve: Resolver): this { this.queryFields.set(name, { resolve }); return this }

  async execute(query: string, ctx: unknown): Promise<Record<string, unknown>> {
    const match = query.match(/\{(\w+)/)
    if (!match) return { errors: 'Invalid query' }
    const field: string = match[1]!
    const resolver = this.queryFields.get(field)
    if (!resolver) return { errors: `Field "${field}" not found` }
    try { return { data: { [field]: await resolver.resolve(null, {}, ctx) } } }
    catch (e: any) { return { errors: e.message } }
  }
}

export function graphqlMiddleware(schema: GraphQLSchema) {
  return async (ctx: any, next: () => Promise<void>) => {
    if (ctx.request.path === '/graphql' && ctx.request.method === 'POST') {
      const { query } = await ctx.request.json()
      const result = await schema.execute(query, ctx)
      ctx.response.json(result)
      return
    }
    return next()
  }
}
