export interface BaselineConfig {
  id: string;
  label: string;
  from: string;
  to: string;
}

export const BASELINE_CONFIGS: BaselineConfig[] = [
  { id: 'biden_2024', label: 'Biden 2024', from: '2024-01-01', to: '2025-01-19' },
  { id: 'biden_2021', label: 'Biden 2021–22', from: '2021-01-20', to: '2022-01-19' },
  { id: 'obama_2013', label: 'Obama 2013–14', from: '2013-01-20', to: '2014-01-19' },
];
