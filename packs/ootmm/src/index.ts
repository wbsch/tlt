import { OoTMMTracker } from './tracker'
import type { TrackerPack } from '@/types/tracker'

/**
 * Factory function to create an OoTMM tracker instance
 */
export async function createOoTMMTracker(): Promise<TrackerPack> {
  const tracker = new OoTMMTracker()
  
  // Initialize with default settings
  await tracker.initialize()
  
  return tracker
}

// Re-export types
export type { OoTMMSettings } from './types/settings'
export type { OoTMMItem, OoTMMLocation } from './types/index'
