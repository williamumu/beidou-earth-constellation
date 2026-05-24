import {
  Cartesian3,
} from "cesium";
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
} from "satellite.js";
import type { SatellitePosition, SatelliteRecord } from "../types";

const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
const GEO_COVERAGE_MIN_ELEVATION_DEG = 5;

export function computeSatellitePosition(
  satellite: SatelliteRecord,
  timestamp: Date,
): SatellitePosition | null {
  const state = propagate(satellite.satrec, timestamp);
  if (!state) {
    return null;
  }

  const position = state.position;

  if (!position || typeof position === "boolean") {
    return null;
  }

  const gmst = gstime(timestamp);
  const geodetic = eciToGeodetic(position, gmst);
  const longitudeDeg = normalizeLongitude(degreesLong(geodetic.longitude));
  const latitudeDeg = degreesLat(geodetic.latitude);
  const altitudeKm = geodetic.height;

  if (
    !Number.isFinite(longitudeDeg) ||
    !Number.isFinite(latitudeDeg) ||
    !Number.isFinite(altitudeKm)
  ) {
    return null;
  }

  return {
    satelliteId: satellite.id,
    longitudeDeg,
    latitudeDeg,
    altitudeKm,
    cartesian: Cartesian3.fromDegrees(longitudeDeg, latitudeDeg, altitudeKm * 1000),
    timestamp,
  };
}

export function buildOrbitPath(
  satellite: SatelliteRecord,
  centerTime: Date,
  samples = 160,
): Cartesian3[] {
  const periodMinutes = 1440 / satellite.meanMotionRevPerDay;
  const startMs = centerTime.getTime() - (periodMinutes * 60_000) / 2;
  const stepMs = (periodMinutes * 60_000) / samples;
  const positions: Cartesian3[] = [];

  for (let sample = 0; sample <= samples; sample += 1) {
    const pointTime = new Date(startMs + stepMs * sample);
    const position = computeSatellitePosition(satellite, pointTime);

    if (position) {
      positions.push(position.cartesian);
    }
  }

  return positions;
}

export function formatCoordinate(value: number, axis: "lat" | "lon"): string {
  const suffix =
    axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(2)}° ${suffix}`;
}

export function orbitalPeriodHours(satellite: SatelliteRecord): number {
  return 24 / satellite.meanMotionRevPerDay;
}

export function buildGeoCoverageFootprint(
  position: SatellitePosition,
  samples = 160,
): Cartesian3[] {
  const centerLatRad = toRadians(position.latitudeDeg);
  const centerLonRad = toRadians(position.longitudeDeg);
  const angularRadiusRad = coverageAngularRadius(
    position.altitudeKm,
    GEO_COVERAGE_MIN_ELEVATION_DEG,
  );
  const points: Cartesian3[] = [];

  for (let index = 0; index < samples; index += 1) {
    const bearingRad = (index / samples) * Math.PI * 2;
    const latRad = Math.asin(
      Math.sin(centerLatRad) * Math.cos(angularRadiusRad) +
        Math.cos(centerLatRad) *
          Math.sin(angularRadiusRad) *
          Math.cos(bearingRad),
    );
    const lonRad =
      centerLonRad +
      Math.atan2(
        Math.sin(bearingRad) *
          Math.sin(angularRadiusRad) *
          Math.cos(centerLatRad),
        Math.cos(angularRadiusRad) - Math.sin(centerLatRad) * Math.sin(latRad),
      );

    points.push(
      Cartesian3.fromDegrees(
        normalizeLongitude(toDegrees(lonRad)),
        toDegrees(latRad),
        28_000,
      ),
    );
  }

  return points;
}

export function geoCoverageMinElevationDeg(): number {
  return GEO_COVERAGE_MIN_ELEVATION_DEG;
}

function normalizeLongitude(longitude: number): number {
  if (longitude > 180) {
    return longitude - 360;
  }

  if (longitude < -180) {
    return longitude + 360;
  }

  return longitude;
}

function coverageAngularRadius(altitudeKm: number, minElevationDeg: number): number {
  const elevationRad = toRadians(minElevationDeg);
  const orbitRadiusKm = EARTH_EQUATORIAL_RADIUS_KM + altitudeKm;
  const radiusRatio = EARTH_EQUATORIAL_RADIUS_KM / orbitRadiusKm;

  return Math.acos(radiusRatio * Math.cos(elevationRad)) - elevationRad;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
