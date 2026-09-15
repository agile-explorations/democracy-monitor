/** Source registry for `pnpm corpus:restore` (#894). */
import { restoreChrg } from './chrg';
import { restoreCl } from './cl';
import { restoreCpd } from './cpd';
import { restoreCrec } from './crec';
import { restoreDoj } from './doj';
import { restoreFr } from './fr';
import type { RestoreFn, RestoreSource } from './types';

export const RESTORE_REGISTRY: Readonly<Record<RestoreSource, RestoreFn>> = {
  fr: restoreFr,
  chrg: restoreChrg,
  cl: restoreCl,
  cpd: restoreCpd,
  doj: restoreDoj,
  crec: restoreCrec,
};
