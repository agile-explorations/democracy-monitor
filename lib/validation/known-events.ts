export interface KnownEvent {
  date: string;
  category: string;
  description: string;
  expectedSeverity: 'Warning' | 'Drift' | 'Capture';
}

export const TRUMP_2017_2018_EVENTS: KnownEvent[] = [
  {
    date: '2017-01-27',
    category: 'military',
    description: 'Travel ban EO #1',
    expectedSeverity: 'Drift',
  },
  {
    date: '2017-01-27',
    category: 'civil_liberties',
    description: 'Travel ban EO #1',
    expectedSeverity: 'Drift',
  },
  {
    date: '2017-03-06',
    category: 'military',
    description: 'Travel ban EO #2',
    expectedSeverity: 'Drift',
  },
  {
    date: '2017-03-06',
    category: 'civil_liberties',
    description: 'Travel ban EO #2',
    expectedSeverity: 'Drift',
  },
  {
    date: '2017-05-09',
    category: 'rule_of_law',
    description: 'James Comey firing',
    expectedSeverity: 'Capture',
  },
  {
    date: '2017-05-09',
    category: 'igs',
    description: 'James Comey firing',
    expectedSeverity: 'Drift',
  },
  {
    date: '2017-03-02',
    category: 'rule_of_law',
    description: 'Jeff Sessions recusal pressure',
    expectedSeverity: 'Warning',
  },
  {
    date: '2017-09-05',
    category: 'civil_liberties',
    description: 'DACA rescission',
    expectedSeverity: 'Drift',
  },
  {
    date: '2018-01-20',
    category: 'fiscal',
    description: 'Government shutdown',
    expectedSeverity: 'Warning',
  },
  {
    date: '2018-04-06',
    category: 'civil_liberties',
    description: 'Family separation policy',
    expectedSeverity: 'Capture',
  },
];
