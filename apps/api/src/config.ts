export const cfg = {
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  supabaseKey: process.env.SUPABASE_KEY || '',
  appKey: process.env.APP_KEY || '',
  adminUsername: (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase(),
  passwordHash: process.env.PASSWORD_HASH || '',
  jwtSecret: process.env.JWT_SECRET || '',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  cacheTtl: Number(process.env.CACHE_TTL || 300),
  fixtureDir: process.env.FIXTURE_DIR || '',
  // Optional language model for the chat assistant. Without a key the assistant answers from search results alone.
  llmKey: process.env.LLM_API_KEY || '',
  llmProvider: (process.env.LLM_PROVIDER || 'anthropic').toLowerCase(), // 'anthropic' or 'openai' (any OpenAI-compatible endpoint)
  llmModel: process.env.LLM_MODEL || '',
  llmBaseUrl: (process.env.LLM_BASE_URL || '').replace(/\/+$/, ''),
};
