/** Reserved product boundary for future non-protocol vehicle discovery. */
export interface DiscoveryService {
  discover(): Promise<never[]>
}
