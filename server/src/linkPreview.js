const cheerio = require('cheerio');

async function getLinkPreview(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // 使用 Node 18+ 内置 fetch，不依赖 node-fetch/undici
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LiteChat/1.0)'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '';

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      '';

    return {
      title: title.trim().slice(0, 200),
      description: description.trim().slice(0, 500),
      image: image.trim()
    };
  } catch (err) {
    return null;
  }
}

module.exports = { getLinkPreview };
