/**
 * Serialize a value for embedding in a `<script type="application/ld+json">`
 * tag WITHOUT an XSS breakout.
 *
 * The content of an `application/ld+json` block is parsed as JSON (not executed
 * as JS), so the only breakout risk is a literal `</script>` closing the tag
 * early — e.g. a document title or AI-generated headline containing
 * `</script><script>…</script>` flowing into the JSON-LD `data`. `JSON.stringify`
 * does not escape `<`, so we escape it (and `>`/`&` as defense-in-depth) to
 * their `\uXXXX` forms, which stay valid JSON but are inert inside HTML.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
