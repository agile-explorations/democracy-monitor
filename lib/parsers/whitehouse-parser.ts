export interface WhiteHouseItem {
  title: string;
  link: string;
  date?: string;
  category?: string;
}

export function parseWhiteHouseFeed(xmlText: string): WhiteHouseItem[] {
  const items: WhiteHouseItem[] = [];

  // Extract items from RSS/XML
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];

    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const category = extractTag(itemXml, 'category');

    if (title && link) {
      items.push({
        title: cleanCDATA(title),
        link: link.trim(),
        date: pubDate,
        category: category ? cleanCDATA(category) : undefined,
      });
    }
  }

  return items.slice(0, 20);
}

function extractTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 's');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

function cleanCDATA(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .trim();
}
