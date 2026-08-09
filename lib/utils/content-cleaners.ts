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
 * Strip DHS/ICE/CBP press-release trailing boilerplate.
 *
 * The fetcher's body-node extraction already excludes nav chrome and contact
 * blocks; what remains (live-observed 2026-08-07) is a trailing block of
 * social-media pointers ("Follow CBP on X @CBPChicago"), media-inquiry
 * contacts, standing mission paragraphs ("HSI is the principal investigative
 * arm…"), or a "###" terminator. Strip from the earliest such marker in the
 * final third of the content so a mid-body mention never truncates substance.
 */
const DHS_PRESS_TAIL_PATTERN =
  /(?:###|Follow (?:us|CBP|ICE|HSI|DHS)\b[^.]*\bon\b|For media inquiries\b|Members of the public may report\b|HSI is (?:the principal|a directorate)\b|Learn more about (?:ICE|CBP|DHS)'s mission\b)/;

/**
 * Strip the DHS press-header prefix present in Wayback-era captures
 * ("For Immediate ReleaseOffice of the Press SecretaryContact: 202-282-8010")
 * — the contemporaneous 2017–2020 template carried it; the modern archive
 * rendering does not. Assessment-time only, like every stripper here.
 */
const DHS_PRESS_HEAD_PATTERN =
  /^For Immediate Release\s*(?:Office of the Press Secretary\s*)?(?:Contact:\s*[\d\s().–-]+)?/;

function stripDhsPressHead(content: string): string {
  const stripped = content.replace(DHS_PRESS_HEAD_PATTERN, '').trimStart();
  return stripped.length > 0 ? stripped : content;
}

function stripDhsPressTail(content: string): string {
  const tailStart = Math.floor(content.length * (2 / 3));
  const match = DHS_PRESS_TAIL_PATTERN.exec(content.slice(tailStart));
  if (!match) return content;
  const stripped = content.slice(0, tailStart + match.index).trimEnd();
  return stripped.length > 0 ? stripped : content;
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

    case 'dhs_press':
      return stripDhsPressTail(stripDhsPressHead(content));

    default:
      return content;
  }
}
