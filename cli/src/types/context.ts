export type SnapshotStatus = 'pending' | 'ready' | 'failed';

export interface SnapshotCapability {
  is_ready: boolean;
  missing_secrets: string[];
}

export interface SnapshotDetail {
  slug: string;
  action: string;
  status: SnapshotStatus;
  capability?: SnapshotCapability;
  updatedAt: string;
}

export interface ContextIndex {
  snapshots: SnapshotDetail[];
  lastUpdated: string;
}
