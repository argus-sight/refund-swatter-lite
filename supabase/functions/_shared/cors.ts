// CORS headers for Edge Functions
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function getCorsHeaders() {
  return corsHeaders
}

export function corsResponse() {
  return new Response('ok', { headers: getCorsHeaders() })
}