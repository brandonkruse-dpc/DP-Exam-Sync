
export interface Timer {
  id: string;
  name: string;
  initialSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  lastUpdated: number; // timestamp
}

export type SyncRole = 'standalone' | 'master' | 'slave';

export interface SyncMessage {
  type: 'SYNC_STATE';
  payload: {
    timers: Timer[];
  };
}

export interface PeerConnectionStatus {
  id: string;
  connected: boolean;
  role: SyncRole;
  error?: string;
}
