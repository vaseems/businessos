export type RegionCode = 'in' | 'us';

export interface RegionCfg {
  code: RegionCode; country: string; name: string; short: string; adj: string; all: string; pick: string;
  central: string; centralLow: string; dept: string; stateUnit: string; unitShort: string; everywhere: string; portalSrc: string;
  noun: string; Noun: string; bizWord: string; edge: string; angle: string; palette: string;
}

const US: RegionCfg = {
  code: 'us', country: 'US', name: 'United States', short: 'US', adj: 'US', all: 'All United States', pick: 'Your state',
  central: 'Federal', centralLow: 'federal', dept: 'Agency', stateUnit: 'states and territories', unitShort: 'States and territories',
  everywhere: 'across the United States', portalSrc: 'official agency pages and policy documents',
  noun: 'programs', Noun: 'Programs', bizWord: 'small businesses', edge: 'US edge', angle: 'US angle',
  palette: 'Search ideas, startups, funding, VCs, programs, jobs, grants, laws',
};
const IN: RegionCfg = {
  code: 'in', country: 'IN', name: 'India', short: 'India', adj: 'Indian', all: 'All India', pick: 'Your state',
  central: 'Central', centralLow: 'central', dept: 'Ministry', stateUnit: 'states and union territories', unitShort: 'States and UTs',
  everywhere: 'across India', portalSrc: 'official portals and policy documents',
  noun: 'schemes', Noun: 'Schemes', bizWord: 'MSMEs', edge: 'India edge', angle: 'India angle',
  palette: 'Search ideas, startups, funding, VCs, programs, jobs, schemes, laws',
};
export const regionCfg = (r: RegionCode): RegionCfg => (r === 'us' ? US : IN);

const INDIA = {
  States: ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'],
  'Union territories': ['Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'],
};
const USA = {
  States: ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
    'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
    'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
    'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
    'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'],
  'District and territories': ['District of Columbia', 'Puerto Rico', 'Guam', 'U.S. Virgin Islands', 'American Samoa', 'Northern Mariana Islands'],
};
export const regionGroups = (r: RegionCode): Record<string, string[]> => (r === 'us' ? USA : INDIA);

export const stateSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function stateMap(r: RegionCode): Record<string, string> {
  const m: Record<string, string> = {};
  for (const names of Object.values(regionGroups(r))) for (const n of names) m[stateSlug(n)] = n;
  return m;
}

const US_ZONE = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Sitka|Nome|Adak|Metlakatla|Yakutat|Menominee|North_Dakota\/.*|Indiana\/.*|Kentucky\/.*)|US\/.*|Pacific\/Honolulu)$/;
export function guessRegionFromTimezone(): RegionCode {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }
  return US_ZONE.test(tz) ? 'us' : 'in';
}
