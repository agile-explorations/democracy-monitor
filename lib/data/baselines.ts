export type BaselineSource = 'federal_register' | 'whitehouse' | 'gdelt';

export interface WhArchiveConfig {
  baseUrl: string; // e.g. 'https://trumpwhitehouse.archives.gov'
  sections: string[]; // e.g. ['/remarks/', '/briefings-statements/']
}

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
  whArchive?: WhArchiveConfig; // for archive-era baselines (non-current WH)
}

const TRUMP_WH_ARCHIVE: WhArchiveConfig = {
  baseUrl: 'https://trumpwhitehouse.archives.gov',
  sections: ['/remarks/', '/briefings-statements/'],
};

export const BASELINE_CONFIGS: BaselineConfig[] = [
  {
    id: 'biden_2022',
    label: 'Biden 2022–23',
    from: '2022-01-20',
    to: '2023-01-19',
    cycleYear: 2,
    administration: 'biden',
    calendarYear: 2022,
    availableSources: ['federal_register', 'whitehouse', 'gdelt'],
  },
  {
    id: 'biden_2021',
    label: 'Biden 2021–22',
    from: '2021-01-20',
    to: '2022-01-19',
    cycleYear: 1,
    administration: 'biden',
    calendarYear: 2021,
    availableSources: ['federal_register', 'whitehouse', 'gdelt'],
  },
  {
    id: 'trump_2017',
    label: 'Trump 2017–18',
    from: '2017-01-20',
    to: '2018-01-19',
    cycleYear: 1,
    administration: 'trump',
    calendarYear: 2017,
    availableSources: ['federal_register', 'whitehouse', 'gdelt'],
    whArchive: TRUMP_WH_ARCHIVE,
  },
  {
    id: 'trump_2018',
    label: 'Trump 2018–19',
    from: '2018-01-20',
    to: '2019-01-19',
    cycleYear: 2,
    administration: 'trump',
    calendarYear: 2018,
    availableSources: ['federal_register', 'whitehouse', 'gdelt'],
    whArchive: TRUMP_WH_ARCHIVE,
  },
];
