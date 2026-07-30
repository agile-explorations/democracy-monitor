export function getAllowedHosts(): string[] {
  if (process.env.ALLOWED_PROXY_HOSTS) {
    return process.env.ALLOWED_PROXY_HOSTS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [
    'oig.ssa.gov',
    'freedomhouse.org',
    'www.reginfo.gov',
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
    'feeds.npr.org',
    'apnews.com',
    'news.google.com',
    'api.govinfo.gov',
    'brightlinewatch.org',
    'api.open.fec.gov',
    'www.fec.gov',
    'oig.hhs.gov',
    'oig.justice.gov',
    'www.oig.dhs.gov',
  ];
}
