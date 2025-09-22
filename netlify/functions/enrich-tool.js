// Netlify Function: enrich-tool
// Fetches a URL and extracts official metadata (title, description, icon)
// Returns JSON: { name, description, iconUrl }

export const handler = async (event) => {
  try {
    const method = (event.httpMethod || 'GET').toUpperCase();
    const params = new URLSearchParams(event.queryStringParameters || {});
    const body = event.body ? JSON.parse(event.body) : {};
    const url = (method === 'GET' ? params.get('url') : body.url) || '';
    if (!url) return { statusCode: 400, body: 'Missing url' };

    const target = new URL(url);
    const res = await fetch(target.toString(), { redirect: 'follow' });
    if (!res.ok) {
      return { statusCode: 200, body: JSON.stringify(basicFallback(target)) };
    }
    const html = await res.text();

    // Lightweight parse for common meta tags
    const meta = extractMeta(html, target);
    return { statusCode: 200, body: JSON.stringify(meta) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ name: '', description: '', iconUrl: '' }) };
  }
};

function absoluteUrl(href, base) {
  try { return new URL(href, base).toString(); } catch { return ''; }
}

function basicFallback(u) {
  const host = u.hostname.replace(/^www\./, '');
  const name = host.split('.')
    .filter(Boolean)
    .slice(0, -1)
    .join(' ')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase()) || host;
  return {
    name,
    description: '',
    iconUrl: absoluteUrl('/favicon.ico', u)
  };
}

function extractMeta(html, baseUrl) {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1]).trim() : '';

  // Extract meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]*>/i) ||
                    html.match(/<meta[^>]+property=["']og:description["'][^>]*>/i) ||
                    html.match(/<meta[^>]+name=["']twitter:description["'][^>]*>/i);
  const description = descMatch ? decode(getAttr(descMatch[0], 'content') || '') : '';

  // Prefer OG title if available
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]*>/i);
  const ogTitle = ogTitleMatch ? decode(getAttr(ogTitleMatch[0], 'content') || '') : '';

  // Extract icon candidates
  const iconLinks = Array.from(html.matchAll(/<link\s+[^>]*rel=["']([^"']*)["'][^>]*>/gi))
    .map(m => m[0])
    .filter(tag => /rel=["']([^"']*icon[^"']*)["']/i.test(tag));
  const iconHref = getBestIconHref(iconLinks) || '/favicon.ico';
  const iconUrl = absoluteUrl(iconHref, baseUrl);

  return {
    name: (ogTitle || title).trim(),
    description: description.trim(),
    iconUrl
  };
}

function getAttr(tag, attr) {
  const re = new RegExp(attr + "\\s*=\\s*([\"'])(.*?)\\1", 'i');
  const m = tag.match(re);
  return m ? m[2] : '';
}

function getBestIconHref(linkTags) {
  // Prefer apple-touch-icon, then icon/png/svg, then shortcut icon
  const score = (rel) => {
    rel = (rel || '').toLowerCase();
    if (rel.includes('apple-touch-icon')) return 3;
    if (rel.includes('icon')) return 2;
    if (rel.includes('shortcut')) return 1;
    return 0;
  };
  let best = { s: 0, href: '' };
  for (const tag of linkTags) {
    const rel = getAttr(tag, 'rel');
    const href = getAttr(tag, 'href');
    const s = score(rel);
    if (s > best.s && href) best = { s, href };
  }
  return best.href;
}

function decode(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
