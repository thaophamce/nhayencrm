export type DashboardTone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'slate';
export type HealthLevel = 'healthy' | 'attention' | 'critical' | 'unavailable';

export interface ExecutiveKpi {
  key: string;
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: DashboardTone;
  route: string;
}

export interface ModuleMetric {
  label: string;
  value: string;
  tone?: DashboardTone;
}

export interface ExecutiveModule {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  route: string;
  tone: DashboardTone;
  health: HealthLevel;
  healthLabel: string;
  primaryLabel: string;
  primaryValue: string;
  primaryNote: string;
  metrics: ModuleMetric[];
  progress?: number;
  loading: boolean;
  error: string;
}

export interface ExecutiveAlert {
  key: string;
  title: string;
  detail: string;
  icon: string;
  route: string;
  level: Exclude<HealthLevel, 'healthy' | 'unavailable'>;
}
