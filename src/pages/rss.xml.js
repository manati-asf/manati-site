import { getCollection } from 'astro:content';

// Minimal RSS feed (no extra dependency). A Make/Zapier automation can watch
// this URL and repost each new article to LinkedIn, Facebook, etc.
const esc = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET(context) {
  const site = context.site?.toString().replace(/\/$/, '') || 'https://manati.co.za';
  const posts = (await getCollection('insights')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  const items = posts.map((p) => `    <item>
      <title>${esc(p.data.title)}</title>
      <link>${site}/insights/${p.slug}/</link>
      <guid>${site}/insights/${p.slug}/</guid>
      <pubDate>${p.data.date.toUTCString()}</pubDate>
      <category>${esc(p.data.tag)}</category>
      <description>${esc(p.data.summary)}</description>
    </item>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Manati — Insights</title>
    <link>${site}/insights</link>
    <description>Articles and guidance from Manati Alternate Student Funding.</description>
    <language>en-za</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
