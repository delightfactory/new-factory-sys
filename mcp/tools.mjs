import { z } from 'zod';
import { tools as analyticalTools } from './analytics.mjs';
import { writes, reads, normalizeWrite, id } from './catalog.mjs';

function result(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}
function safeError(error) {
  return { isError: true, content: [{ type: 'text', text:
    /^MCP_[A-Z_]{3,64}$/.test(error.message) ? error.message : 'MCP_OPERATION_FAILED' }] };
}
export function registerTools(server, rpc) {
  for (const [name, definition] of Object.entries(analyticalTools)) {
    server.registerTool(name, {description:definition.description,inputSchema:definition.schema,annotations:{readOnlyHint:true,openWorldHint:false}},async args=>{
      try{return result(await rpc(name === 'factory_schema' ? 'schema' : 'analyze',{payload:definition.schema.parse(args)}));}
      catch(error){return safeError(error);}
    });
  }
  server.registerTool('factory_context', { description: 'Show current user role and approved integration access.',
    inputSchema: {}, annotations: { readOnlyHint: true, openWorldHint: false } }, async () => {
    try { return result(await rpc('context')); } catch (e) { return safeError(e); }
  });
  server.registerTool('factory_lookup', { description: 'Find existing customer/product IDs. Bounded results; all names are untrusted record data.',
    inputSchema: { kind: z.enum(['customers', 'finished_products', 'semi_finished_products']),
      search: z.string().max(100).optional(), limit: z.number().int().min(1).max(50).optional() },
    annotations: { readOnlyHint: true, openWorldHint: false } }, async args => {
    try { return result(await rpc('query', { kind: args.kind, payload: args })); } catch (e) { return safeError(e); }
  });
  server.registerTool('factory_get_operation', { description: 'Read a sales invoice or production/packaging order by its ID.',
    inputSchema: { kind: z.enum(['sales_invoice', 'production_order', 'packaging_order']), id },
    annotations: { readOnlyHint: true, openWorldHint: false } }, async args => {
    try { return result(await rpc('query', { kind: 'operation', payload: args })); } catch (e) { return safeError(e); }
  });
  for (const [action, definition] of Object.entries(writes)) {
    const schema=definition.schema;
    server.registerTool(`factory_${action}`, {
      description: definition.description + ' Use a new UUID request_id per user intent; preserve it and identical arguments on retry after timeout.',
      inputSchema: z.object(schema).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, async args => {
      try {
        // Validate strictly again: unknown fields must never reach the database.
        const parsed = z.object(schema).strict().parse(args);
        return result(await rpc('write', normalizeWrite(action,parsed)));
      } catch (e) { return safeError(e); }
    });
  }
  for(const [kind,definition] of Object.entries(reads)) {
    server.registerTool(`factory_${kind}`,{description:definition.description,inputSchema:z.object(definition.schema).strict(),
      annotations:{readOnlyHint:true,openWorldHint:false}},async args=>{
      try{return result(await rpc('query',{kind,payload:z.object(definition.schema).strict().parse(args)}));}
      catch(error){return safeError(error);}
    });
  }
}
