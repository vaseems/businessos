// Small, realistic datasets in the shape the Supabase RPCs return. Used by the offline tests and serve-mock.
const idea = (rank, slug, name, angle, score) => ({ slug, name, india_angle: angle, problem: 'Teams lose hours on ' + name.toLowerCase(), solution: 'A focused tool for ' + name.toLowerCase(), first_customers: 'Mid-size firms', rough_mvp: 'Two-week pilot', main_risk: 'Slow sales cycles', score, rank_no: rank, critical: 4, demand: 4, ease: 3, india_edge: 5, region: 'IN', active: true });
const src = (slug, name, kind, status, deadline, summary, org) => ({ slug, name, org, kind, status, deadline, summary, stages: ['Seed'], sectors: 'Deeptech, AI', country: 'IN', geography: 'India', confidence: 'high', checked_on: '2026-11-15' });

module.exports = {
  data: {
    ideas: [
      idea(1, 'whatsapp-onboarding', 'WhatsApp worker onboarding', 'Shift workers onboard through Aadhaar and UAN over WhatsApp', 88),
      idea(2, 'dpdp-consent-manager', 'DPDP consent manager', 'Small firms need consent records for the DPDP Act', 84),
      idea(3, 'gst-recon-bot', 'GST reconciliation assistant', 'Accountants reconcile GSTR-2B by hand every month', 79),
    ],
    weights: [], log: [{ idea_slug: 'dpdp-consent-manager', change: 'added', logged_on: '2026-11-10', note: 'New' }],
    startups: [
      { slug: 'agnikul', name: 'Agnikul Cosmos', one_liner: '3D-printed rocket engines', sector: 'Spacetech', hq_city: 'Chennai', hq_country: 'India', region: 'India', stage: 'Series B', last_round_amount_usd_m: 26 },
      { slug: 'gusto-ai', name: 'Gusto AI', one_liner: 'AI payroll for small firms', sector: 'Fintech', hq_city: 'Austin', hq_country: 'US', region: 'Global', stage: 'Seed', last_round_amount_usd_m: 4 },
    ],
    rounds: [],
  },
  funding: {
    deals: [
      { slug: 'kutlerri-ai-2026-11-13', company: 'Kutlerri.ai', announced_on: '2026-11-13', sector: 'AI', stage: 'Seed', amount_usd_m: 4, investors: 'Peak XV, Blume', hq_city: 'Bengaluru', country: 'IN' },
      { slug: 'agnikul-2026-10-02', company: 'Agnikul Cosmos', announced_on: '2026-10-02', sector: 'Spacetech', stage: 'Series B', amount_usd_m: 26, investors: 'Mayfield', hq_city: 'Chennai', country: 'IN' },
      { slug: 'old-co-2025-01-10', company: 'Old Co', announced_on: '2025-01-10', sector: 'SaaS', stage: 'Seed', amount_usd_m: 1, investors: 'Angel list', hq_city: 'Pune', country: 'IN' },
    ],
  },
  opportunities: {
    sources: [
      src('deeptechx', 'DeepTechX Accelerator', 'cohort', 'open', '2026-12-20', 'Two-week bootcamp then 60-day incubator for deeptech startups', 'Startup Réseau'),
      src('biparc-grant', 'BIRAC BIG grant', 'grant', 'rolling', null, 'Grant up to 50 lakh for biotech ideas', 'BIRAC'),
      src('surge', 'Surge', 'cohort', 'closed', null, 'Sequoia and Peak XV program for early startups', 'Peak XV'),
      src('mumbai-angels', 'Mumbai Angels', 'angel', 'rolling', null, 'Angel network investing in seed rounds', 'Mumbai Angels'),
      src('aws-activate', 'AWS Activate', 'perk', 'open', null, 'Cloud credits for startups', 'AWS'),
    ],
  },
  policy: {
    schemes: [
      { slug: 'sisfs', name: 'Startup India Seed Fund', ministry: 'DPIIT', category: 'Funding', highlight: 'Seed funding through incubators', benefit: 'Up to 50 lakh', eligibility: 'DPIIT-recognised startups', status: 'active', country: 'IN', level: 'Central', audience: [] },
      { slug: 'gj-msme', name: 'Gujarat MSME incentive', ministry: 'Industries Department', category: 'Subsidy', highlight: 'State capital subsidy', status: 'active', country: 'IN', state: 'Gujarat', level: 'State', audience: [] },
    ],
    regulations: [
      { slug: 'dpdp-act', name: 'Digital Personal Data Protection Act', short_name: 'DPDP', category: 'Data protection', regulator: 'MeitY', status: 'phased', summary: 'Consent and breach rules for personal data', key_obligations: ['Consent notices'], startup_actions: ['Map personal data'], country: 'IN' },
      { slug: 'cert-in', name: 'CERT-In directions', short_name: 'CERT-In', category: 'IT and cybersecurity', regulator: 'MeitY', status: 'in_force', summary: 'Cyber incident reporting within six hours', key_obligations: [], startup_actions: [], country: 'IN' },
    ],
    milestones: [],
  },
  jobs: {
    sources: [],
    future: [{ source_slug: 'wef', outlook: 'growing', horizon: '2030', region: 'Global', rank_no: 1, role: 'AI and machine learning specialists', note: 'Fastest growing' }],
    hot: [{ source_slug: 'wef', region: 'India', role: 'Data engineer', rank_no: 1, signal: 'high demand' }],
    skills: [{ source_slug: 'wef', category: 'rising', region: 'India', skill: 'Prompt engineering', rank_no: 1 }],
    stats: [], role_skills: [],
  },
};
