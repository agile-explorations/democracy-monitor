export function getAllowedHosts(): string[] {
  if (process.env.ALLOWED_PROXY_HOSTS) {
    return process.env.ALLOWED_PROXY_HOSTS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [
    'www.gao.gov',
    'www.defense.gov',
    'oig.ssa.gov',
    'freedomhouse.org',
    'www.oversight.gov',
    'www.reginfo.gov',
    'www.supremecourt.gov',
    'www.federalregister.gov',
    'osc.gov',
    'www.mspb.gov',
    'www.gsaig.gov',
    'feeds.whitehouse.gov',
    'www.whitehouse.gov',
    'www.govinfo.gov',
    'api.regulations.gov',
    'open.gsa.gov',
    'www.brookings.edu',
    'www.naacpldf.org',
    'progressivereform.org',
    'www.democracywatchtracker.org',
    'www.v-dem.net',
  ];
}
