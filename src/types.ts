import type { SatRec } from "satellite.js";
import type { Cartesian3 } from "cesium";

export type OrbitType = "GEO" | "IGSO" | "MEO";
export type SatelliteSortMode = "launch-desc" | "launch-asc" | "orbit" | "name";

export interface SatelliteRecord {
  id: string;
  noradId: string;
  objectId: string | null;
  name: string;
  orbitType: OrbitType;
  launchDate: string | null;
  officialLaunchDate: string | null;
  launchSite: string | null;
  opsStatusCode: string | null;
  tle1: string;
  tle2: string;
  satrec: SatRec;
  epoch: Date | null;
  inclinationDeg: number;
  meanMotionRevPerDay: number;
}

export interface SatellitePosition {
  satelliteId: string;
  longitudeDeg: number;
  latitudeDeg: number;
  altitudeKm: number;
  cartesian: Cartesian3;
  timestamp: Date;
}

export interface SimulationState {
  currentTime: Date;
  isPlaying: boolean;
  speedMultiplier: number;
  activeOrbitTypes: Record<OrbitType, boolean>;
  searchQuery: string;
  sortMode: SatelliteSortMode;
  selectedSatelliteId: string | null;
}
