// Firebase TRACKER order shape — mirrors CreateOrderModal.jsx exactly

export interface FirebaseTimestamps {
  demo?: string;
  designing?: string;
  approved?: string;
  cancelled?: string;
}

export interface FileCountHistoryEntry {
  count: number;
  changedAt: string; // ISO string
}

export interface FirebaseHistoryEntry {
  timestamp: string;
  status: string;
  changedBy: string;
  changedByName: string;
  action: string;
}

export type FirebaseOrderStatus = 'demo' | 'designing' | 'approved' | 'cancelled';

export interface FirebaseOrder {
  orderCode: string;
  fileCount: number;
  isUrgent: boolean;
  hasDesignFee: boolean;
  isOutsource: boolean;
  designerId: string | null;
  notes?: string;
  status: FirebaseOrderStatus;
  createdAt: string;       // ISO string
  createdBy?: string;      // email
  createdByName?: string;
  timestamps: FirebaseTimestamps;
  history?: FirebaseHistoryEntry[];
  fileCountHistory?: FileCountHistoryEntry[];
  designFeeTickedAt?: string;
  outsourceKpiOwner?: string;
  outsourceKpiFileCount?: number;
  outsourceKpiTickedAt?: string;
  outsourceKpiTickedBy?: string;
  approvedDesignerId?: string;  // audit-only
  approvedAt?: string;
  outsourceApprovedBy?: string;
  outsourceApprovedAt?: string;
  outsourceApprovedBonus?: number;
}

export interface SnapshotMeta {
  runId: string;
  capturedAt: string;
  firebaseProject: string;
  firebaseNode: string;
  totalRecords: number;
  checksumSha256: string; // SHA-256 of canonical snapshot JSON
}
