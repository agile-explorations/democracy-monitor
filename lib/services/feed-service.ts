export async function fetchData(url: string, _type: string): Promise<any> {
  // Direct fetch for internal APIs
  if (url.startsWith('/api/')) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  }

  // Proxy for external URLs
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`Proxy ${r.status}`);
  return r.json();
}
