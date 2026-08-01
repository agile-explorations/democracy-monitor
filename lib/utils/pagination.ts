/**
 * Guard for following an API-supplied pagination URL (#630).
 *
 * Several source fetchers follow a `next`/`nextPage` URL taken straight from the
 * response body, and GovInfo has our API key appended to it. A tampered or
 * compromised source response could point that URL at an attacker host — and in
 * the GovInfo case leak the API key there. The network-MITM path is already
 * closed by TLS; this is defense-in-depth against a bad *source* response.
 *
 * Returns true only when `candidate` is an absolute https URL on the same host
 * as `baseUrl`. A non-https, off-host, relative, or unparseable URL returns
 * false, and the caller halts pagination.
 */
export function isSameHostHttps(candidate: string, baseUrl: string): boolean {
  let candidateUrl: URL;
  let baseUrlParsed: URL;
  try {
    candidateUrl = new URL(candidate);
    baseUrlParsed = new URL(baseUrl);
  } catch {
    return false;
  }
  return candidateUrl.protocol === 'https:' && candidateUrl.hostname === baseUrlParsed.hostname;
}
