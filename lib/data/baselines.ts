export type BaselineSource = 'federal_register' | 'gdelt';

export interface BaselineConfig {
  id: string;
  label: string;
  from: string;
  to: string;
  cycleYear: number; // 1–4 (year within presidential term)
  administration: string; // e.g. 'biden', 'trump'
  calendarYear: number; // e.g. 2022
  availableSources: BaselineSource[];
  sourceNotes?: string; // human-readable explanation of source limitations
}

/**
 * Find the Biden baseline config matching a given cycle year.
 * Falls back to the first available Biden baseline if no exact match exists.
 */
export function getBaselineConfigForCycleYear(cycleYear: number): BaselineConfig | undefined {
  return (
    BASELINE_CONFIGS.find((c) => c.administration === 'biden' && c.cycleYear === cycleYear) ??
    BASELINE_CONFIGS.find((c) => c.administration === 'biden')
  );
}

export const BASELINE_CONFIGS: BaselineConfig[] = [
  {
    id: 'biden_2022',
    label: 'Biden 2022–23',
    from: '2022-01-20',
    to: '2023-01-19',
    cycleYear: 2,
    administration: 'biden',
    calendarYear: 2022,
    availableSources: ['federal_register', 'gdelt'],
  },
  {
    id: 'biden_2021',
    label: 'Biden 2021–22',
    from: '2021-01-20',
    to: '2022-01-19',
    cycleYear: 1,
    administration: 'biden',
    calendarYear: 2021,
    availableSources: ['federal_register', 'gdelt'],
  },
  {
    id: 'trump_2017',
    label: 'Trump 2017–18',
    from: '2017-01-20',
    to: '2018-01-19',
    cycleYear: 1,
    administration: 'trump',
    calendarYear: 2017,
    availableSources: ['federal_register', 'gdelt'],
  },
  {
    id: 'trump_2018',
    label: 'Trump 2018–19',
    from: '2018-01-20',
    to: '2019-01-19',
    cycleYear: 2,
    administration: 'trump',
    calendarYear: 2018,
    availableSources: ['federal_register', 'gdelt'],
  },
  {
    id: 'trump_2019',
    label: 'Trump 2019–20',
    from: '2019-01-20',
    to: '2020-01-19',
    cycleYear: 3,
    administration: 'trump',
    calendarYear: 2019,
    availableSources: ['federal_register', 'gdelt'],
  },
  {
    id: 'trump_2020',
    label: 'Trump 2020–21',
    from: '2020-01-20',
    to: '2021-01-19',
    cycleYear: 4,
    administration: 'trump',
    calendarYear: 2020,
    availableSources: ['federal_register', 'gdelt'],
  },
  {
    id: 'biden_2023',
    label: 'Biden 2023–24',
    from: '2023-01-20',
    to: '2024-01-19',
    cycleYear: 3,
    administration: 'biden',
    calendarYear: 2023,
    availableSources: ['federal_register', 'gdelt'],
  },
  {
    id: 'biden_2024',
    label: 'Biden 2024–25',
    from: '2024-01-20',
    to: '2025-01-19',
    cycleYear: 4,
    administration: 'biden',
    calendarYear: 2024,
    availableSources: ['federal_register', 'gdelt'],
  },
];
