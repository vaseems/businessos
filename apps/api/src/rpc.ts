import { cfg } from './config';

export class RpcError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Calls a SECURITY DEFINER function in Supabase with the app key. Throws RpcError on any failure. */
export async function rpc<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
  if (!cfg.supabaseUrl || !cfg.supabaseKey) throw new RpcError(503, 'Supabase is not configured');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    apikey: cfg.supabaseKey,
  };
  if (cfg.supabaseKey.startsWith('eyJ')) headers.Authorization = 'Bearer ' + cfg.supabaseKey;
  let res: Response;
  try {
    res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_key: cfg.appKey, ...args }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new RpcError(503, 'Could not reach the database');
  }
  if (!res.ok) throw new RpcError(res.status === 401 || res.status === 403 ? 503 : 502, 'Database request failed');
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
