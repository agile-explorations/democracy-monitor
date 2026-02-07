/**
 * Demo mode — serves deterministic fixture data from all API routes.
 *
 * Activated by DEMO_MODE=true. Scenario selected via DEMO_SCENARIO (default: 'mixed').
 * Each API route calls getDemoResponse() as an early-return guard.
 */

import type { NextApiRequest } from 'next';
import type { ScenarioName } from './scenarios';
import { DEMO_SCENARIOS } from './scenarios';
import * as feeds from './fixtures/feeds';
import { getDemoAssessment } from './fixtures/assessments';
import { getDemoIntentAssessment, getDemoIntentStatements } from './fixtures/intent';
import { getDemoDebate, getDemoLegalAnalysis, getDemoTrends, getDemoDailyDigest } from './fixtures/ai';
import { getDemoUptimeStatus, getDemoUptimeCheck } from './fixtures/uptime';

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

export function getDemoScenario(): ScenarioName {
  const s = process.env.DEMO_SCENARIO || 'mixed';
  return s in DEMO_SCENARIOS ? (s as ScenarioName) : 'mixed';
}

/**
 * Central router. Returns fixture data for a given route, or null if not in demo mode.
 */
export function getDemoResponse(routeId: string, req: NextApiRequest): unknown | null {
  if (!isDemoMode()) return null;

  const scenario = getDemoScenario();
  const query = req.query;
  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};

  switch (routeId) {
    // ── Proxy route: match by URL hostname/path ──
    case 'proxy': {
      const targetUrl = (query.url || query.target || '') as string;
      return matchProxyFixture(targetUrl);
    }

    // ── Federal Register route: match by agency/type/term ──
    case 'federal-register': {
      return matchFederalRegisterFixture(query);
    }

    // ── Scrape tracker ──
    case 'scrape-tracker': {
      return {
        cached: false,
        type: 'tracker_scrape',
        source: query.source || 'demo',
        sourceUrl: 'https://demo.example.com',
        items: [
          { title: 'Democracy Tracker: Weekly Update on Institutional Norms', link: 'https://demo.example.com/1', date: new Date().toISOString() },
          { title: 'Analysis: Federal Workforce Changes and Their Impact', link: 'https://demo.example.com/2', date: new Date().toISOString() },
        ],
        scrapedAt: new Date().toISOString(),
      };
    }

    // ── Assessment ──
    case 'assess-status': {
      const category = body.category || (query.category as string) || '';
      const isAI = query.ai === 'true';
      return getDemoAssessment(category, scenario, isAI);
    }

    // ── Intent ──
    case 'intent/assess':
      return getDemoIntentAssessment(scenario);

    case 'intent/statements':
      return getDemoIntentStatements(scenario);

    // ── Uptime ──
    case 'uptime/status':
      return getDemoUptimeStatus(scenario);

    case 'uptime/check':
      return getDemoUptimeCheck(scenario);

    // ── AI features ──
    case 'ai/assess': {
      const cat = body.category || '';
      return getDemoAssessment(cat, scenario, true);
    }

    case 'ai/debate': {
      const cat = body.category || '';
      const status = body.status || '';
      return getDemoDebate(cat, status, scenario);
    }

    case 'ai/legal-analysis': {
      const cat = body.category || '';
      const status = body.status || '';
      return getDemoLegalAnalysis(cat, status, scenario);
    }

    case 'ai/daily-digest':
      return getDemoDailyDigest(scenario);

    case 'ai/trends': {
      const cat = body.category || '';
      return getDemoTrends(cat, scenario);
    }

    case 'digest': {
      const digest = getDemoDailyDigest(scenario);
      return { ...digest, date: (query.date as string) || digest.date };
    }

    default:
      return null;
  }
}

// ── Proxy fixture matcher ──────────────────────────────────────

function matchProxyFixture(targetUrl: string): unknown | null {
  if (!targetUrl) return null;

  if (targetUrl.includes('gao.gov') && targetUrl.includes('rss')) return feeds.gaoReports();
  if (targetUrl.includes('oversight.gov')) return feeds.igsOversight();
  if (targetUrl.includes('oig.ssa.gov')) return feeds.igsSsa();
  if (targetUrl.includes('supremecourt.gov')) return feeds.courtsSupreme();
  if (targetUrl.includes('defense.gov') && targetUrl.includes('ContentType=1')) return feeds.militaryNews();
  if (targetUrl.includes('defense.gov') && targetUrl.includes('ContentType=9')) return feeds.militaryContracts();

  // Fallback for any unmatched proxy URL
  return {
    cached: false,
    data: {
      type: 'rss',
      items: [
        { title: 'Demo fixture — unmatched proxy URL', link: targetUrl, pubDate: new Date().toISOString() },
      ],
    },
  };
}

// ── Federal Register fixture matcher ───────────────────────────

function matchFederalRegisterFixture(query: NextApiRequest['query']): unknown {
  const agency = (query.agency || '') as string;
  const type = (query.type || '') as string;
  const term = (query.term || '') as string;

  // Agency-based matching
  if (agency.includes('personnel-management')) return feeds.civilServiceOpm();
  if (agency.includes('special-counsel')) return feeds.hatchSpecialCounsel();

  // Term-based matching
  if (term.includes('schedule') && term.includes('civil')) return feeds.civilServiceScheduleF();
  if (term.includes('impoundment')) return feeds.fiscalImpoundment();
  if (term.includes('hatch')) return feeds.hatchActNews();
  if (term.includes('injunction') || term.includes('compliance')) return feeds.courtsCompliance();

  // Type-based matching
  if (type === 'RULE') return feeds.rulemakingFinal();
  if (type === 'PRORULE') return feeds.rulemakingProposed();
  if (type === 'PRESDOCU') return feeds.indicesPresidential();

  // Fallback
  return {
    cached: false,
    type: 'federal_register',
    items: [
      { title: 'Demo fixture — Federal Register placeholder', link: 'https://www.federalregister.gov', pubDate: new Date().toISOString(), agency: 'Demo', type: 'NOTICE' },
    ],
    count: 1,
    url: 'https://www.federalregister.gov',
  };
}
