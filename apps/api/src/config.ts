export const cfg = {
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  supabaseKey: process.env.SUPABASE_KEY || '',
  appKey: process.env.APP_KEY || '',
  passwordHash: process.env.PASSWORD_HASH || '',
  jwtSecret: process.env.JWT_SECRET || '',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  cacheTtl: Number(process.env.CACHE_TTL || 300),
  fixtureDir: process.env.FIXTURE_DIR || '',
};
