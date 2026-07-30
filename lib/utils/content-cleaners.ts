/**
 * Source-specific boilerplate strippers for P1/P2 assessment.
 *
 * Applied at assessment time only — raw content stays intact in the database.
 * Each stripper removes consistent, measured boilerplate patterns so the AI
 * assessment windows (P1 4K, P2 8K) contain substantive content.
 */

/**
 * Strip Federal Register GPO raw-text header.
 *
 * Pattern: "Federal Register, Volume NN Issue NN (Day, Date)" followed by
 * bracketed metadata, www.gpo.gov reference, and separator lines (=== / ---).
 * Measured: median 276 chars, affects 40,457 docs (50% of FR).
 *
 * Only applies to docs fetched from GPO raw text — FR docs with API abstracts
 * start with substantive content and are unaffected.
 */
function stripFrGpoHeader(content: string): string {
  // Match from start through the last --- separator line and trailing whitespace
  return content.replace(/^Federal Register, Volume[\s\S]*?-{3,}\s*/, '');
}

/**
 * Strip CPD CSS contamination from GovInfo presidential documents.
 *
 * Pattern: "DCPD" identifier followed by embedded CSS stylesheet rules
 * ({margin:0}, .s1 {}, h1 {}, .p, p {} etc). Actual content starts with
 * "Administration of..." after the last closing brace.
 * Measured: median 769 chars, affects 8,129 docs (69% of CPD).
 */
function stripCpdCss(content: string): string {
  // CSS preamble is always in the first ~1500 chars (measured max: 1460).
  // Find the last closing brace within that window, then take everything after.
  const searchWindow = content.slice(0, 2000);
  let lastBrace = -1;
  for (let i = searchWindow.length - 1; i >= 0; i--) {
    if (searchWindow[i] === '}') {
      lastBrace = i;
      break;
    }
  }
  if (lastBrace === -1) return content;
  const after = content.slice(lastBrace + 1).replace(/^\s+/, '');
  return after.length > 0 ? after : content;
}

/**
 * Strip GovInfo Congressional Report header.
 *
 * Pattern: "Senate/House Report NNN-NNN - TITLE" followed by bracketed
 * metadata, GPO source line, Congress/session info, and separator lines.
 * Measured: median 228 chars, affects 3,215 docs (99% of GovInfo).
 */
function stripGovInfoReportHeader(content: string): string {
  return content.replace(/^(?:Senate|House) Report[\s\S]*?={3,}\s*/, '');
}

/**
 * Strip CREC title repetition from Congressional Record content.
 *
 * CREC content typically starts with the document title repeated, followed
 * by the actual speech. Since the title is already passed separately to P1/P2,
 * the repeated title wastes assessment tokens.
 */
function stripCrecTitleRepetition(content: string, title: string): string {
  if (!title) return content;
  const trimmedTitle = title.trim();
  if (trimmedTitle && content.startsWith(trimmedTitle)) {
    return content.slice(trimmedTitle.length).replace(/^\s+/, '');
  }
  return content;
}

/**
 * Strip CHRG hearing-transcript front matter.
 *
 * Pattern (live-observed): "- TITLE IN CAPS [House Hearing, 116 Congress]
 * [From the U.S. Government Publishing Office]" before the transcript body.
 * The title is passed separately to P1/P2, so the leading repetition and
 * bracketed GPO metadata waste assessment tokens.
 */
function stripChrgFrontMatter(content: string): string {
  return content.replace(
    /^[-\s]*[^[]{0,300}?\[(?:House|Senate|Joint) Hearing[^\]]*\]\s*(?:\[From the U\.S\. Government Publishing Office\])?\s*/i,
    '',
  );
}

/**
 * Strip source-specific boilerplate from document content.
 *
 * @param content - Raw document content from database
 * @param sourceOrigin - Source origin identifier (e.g., 'federal_register', 'govinfo_cpd')
 * @param title - Document title (used for CREC title repetition stripping)
 * @returns Content with boilerplate removed
 */
export function stripBoilerplate(
  content: string,
  sourceOrigin: string | null,
  title?: string,
): string {
  if (!content) return content;

  switch (sourceOrigin) {
    case 'federal_register':
      if (content.startsWith('Federal Register, Volume')) {
        return stripFrGpoHeader(content);
      }
      return content;

    case 'govinfo_cpd':
      if (content.startsWith('DCPD')) {
        return stripCpdCss(content);
      }
      return content;

    case 'govinfo':
      if (/^(?:Senate|House) Report/.test(content)) {
        return stripGovInfoReportHeader(content);
      }
      return content;

    case 'crec':
      return stripCrecTitleRepetition(content, title ?? '');

    case 'chrg':
      return stripChrgFrontMatter(content);

    default:
      return content;
  }
}
