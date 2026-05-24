import { useEffect, useMemo, useRef } from "react";
import {
  ArcType,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantPositionProperty,
  ConstantProperty,
  DistanceDisplayCondition,
  Entity,
  HorizontalOrigin,
  ImageryLayer,
  LabelStyle,
  NearFarScalar,
  PolylineGlowMaterialProperty,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  VerticalOrigin,
  Viewer,
  buildModuleUrl,
  defined,
} from "cesium";
import type { OrbitType, SatelliteRecord } from "../types";
import {
  buildGeoCoverageFootprint,
  buildOrbitPath,
  computeSatellitePosition,
} from "../lib/orbit";

interface EarthSceneProps {
  satellites: SatelliteRecord[];
  currentTime: Date;
  selectedSatelliteId: string | null;
  onSelectSatellite: (satelliteId: string) => void;
}

const ORBIT_COLORS: Record<OrbitType, Color> = {
  GEO: Color.fromCssColorString("#29d3ff"),
  IGSO: Color.fromCssColorString("#ffc857"),
  MEO: Color.fromCssColorString("#65f2a4"),
};

export function EarthScene({
  satellites,
  currentTime,
  selectedSatelliteId,
  onSelectSatellite,
}: EarthSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const satelliteEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const orbitEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const coverageEntitiesRef = useRef<
    Map<string, { boundary: Entity; fill: Entity }>
  >(new Map());
  const onSelectRef = useRef(onSelectSatellite);
  const currentTimeRef = useRef(currentTime);
  const selectedSatelliteIdRef = useRef(selectedSatelliteId);

  const satellitesById = useMemo(
    () => new Map(satellites.map((satellite) => [satellite.id, satellite])),
    [satellites],
  );

  useEffect(() => {
    onSelectRef.current = onSelectSatellite;
  }, [onSelectSatellite]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    selectedSatelliteIdRef.current = selectedSatelliteId;
  }, [selectedSatelliteId]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) {
      return;
    }

    const creditContainer = document.createElement("div");
    creditContainer.className = "cesium-credit-sink";
    containerRef.current.appendChild(creditContainer);

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      baseLayer: ImageryLayer.fromProviderAsync(
        TileMapServiceImageryProvider.fromUrl(
          buildModuleUrl("Assets/Textures/NaturalEarthII"),
        ),
      ),
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      shouldAnimate: true,
      timeline: false,
      creditContainer,
    });

    viewerRef.current = viewer;
    viewer.scene.backgroundColor = Color.fromCssColorString("#020713");
    viewer.scene.globe.baseColor = Color.fromCssColorString("#071421");
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.fog.enabled = false;

    const firstImageryLayer = viewer.imageryLayers.get(0);
    firstImageryLayer.brightness = 0.48;
    firstImageryLayer.contrast = 1.18;
    firstImageryLayer.saturation = 0.7;
    firstImageryLayer.gamma = 0.78;

    addReferenceGrid(viewer);

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(108, 20, 68_000_000),
      orientation: {
        heading: 0,
        pitch: -1.57079632679,
        roll: 0,
      },
    });

    const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    const satelliteEntities = satelliteEntitiesRef.current;
    const orbitEntities = orbitEntitiesRef.current;
    const coverageEntities = coverageEntitiesRef.current;
    clickHandler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(movement.position);

      if (!defined(picked) || !(picked.id instanceof Entity)) {
        return;
      }

      const satelliteId = picked.id.properties?.satelliteId?.getValue();

      if (typeof satelliteId === "string") {
        onSelectRef.current(satelliteId);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      clickHandler.destroy();
      satelliteEntities.clear();
      orbitEntities.clear();
      coverageEntities.clear();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    for (const entity of satelliteEntitiesRef.current.values()) {
      viewer.entities.remove(entity);
    }

    for (const entity of orbitEntitiesRef.current.values()) {
      viewer.entities.remove(entity);
    }

    for (const coverage of coverageEntitiesRef.current.values()) {
      viewer.entities.remove(coverage.fill);
      viewer.entities.remove(coverage.boundary);
    }

    satelliteEntitiesRef.current.clear();
    orbitEntitiesRef.current.clear();
    coverageEntitiesRef.current.clear();

    for (const satellite of satellites) {
      const color = ORBIT_COLORS[satellite.orbitType];
      const renderTime = currentTimeRef.current;
      const position = computeSatellitePosition(satellite, renderTime);
      const isSelected = selectedSatelliteIdRef.current === satellite.id;

      if (!position) {
        continue;
      }

      const entity = viewer.entities.add({
        id: `satellite-${satellite.id}`,
        name: satellite.name,
        position: position.cartesian,
        properties: {
          satelliteId: satellite.id,
        },
        point: {
          color: isSelected ? Color.WHITE : color,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          outlineColor: Color.fromCssColorString("#02111f"),
          outlineWidth: isSelected ? 3 : 2,
          pixelSize: isSelected ? 13 : 8,
          scaleByDistance: new NearFarScalar(2_000_000, 1.35, 90_000_000, 0.6),
        },
        label: {
          backgroundColor: Color.fromCssColorString("#06101d").withAlpha(0.78),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 72_000_000),
          fillColor: Color.fromCssColorString("#eaf7ff"),
          font: "12px Inter, system-ui, sans-serif",
          horizontalOrigin: HorizontalOrigin.LEFT,
          outlineColor: Color.fromCssColorString("#020713"),
          outlineWidth: 3,
          pixelOffset: new Cartesian3(12, -10, 0),
          scaleByDistance: new NearFarScalar(8_000_000, 0.95, 72_000_000, 0.48),
          showBackground: true,
          style: LabelStyle.FILL_AND_OUTLINE,
          text: satellite.name,
          verticalOrigin: VerticalOrigin.CENTER,
        },
      });

      const orbitPath = buildOrbitPath(satellite, renderTime);
      const orbitEntity = viewer.entities.add({
        id: `orbit-${satellite.id}`,
        name: `${satellite.name} orbit`,
        polyline: {
          arcType: ArcType.NONE,
          depthFailMaterial: getOrbitDepthMaterial(color, isSelected),
          material: getOrbitMaterial(color, isSelected),
          positions: orbitPath,
          width: getOrbitWidth(isSelected),
        },
      });

      if (satellite.orbitType === "GEO") {
        const footprint = buildGeoCoverageFootprint(position);
        const coverageFill = viewer.entities.add({
          id: `coverage-${satellite.id}`,
          name: `${satellite.name} coverage`,
          properties: {
            satelliteId: satellite.id,
          },
          polygon: {
            hierarchy: new PolygonHierarchy(footprint),
            material: getCoverageFillMaterial(color, isSelected),
          },
        });
        const coverageBoundary = viewer.entities.add({
          id: `coverage-boundary-${satellite.id}`,
          name: `${satellite.name} coverage boundary`,
          properties: {
            satelliteId: satellite.id,
          },
          polyline: {
            arcType: ArcType.NONE,
            material: getCoverageBoundaryMaterial(color, isSelected),
            positions: closeFootprint(footprint),
            width: isSelected ? 2.2 : 1,
          },
        });

        coverageEntitiesRef.current.set(satellite.id, {
          boundary: coverageBoundary,
          fill: coverageFill,
        });
      }

      satelliteEntitiesRef.current.set(satellite.id, entity);
      orbitEntitiesRef.current.set(satellite.id, orbitEntity);
    }
  }, [satellites]);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    for (const [satelliteId, entity] of satelliteEntitiesRef.current.entries()) {
      const satellite = satellitesById.get(satelliteId);

      if (!satellite) {
        entity.show = false;
        continue;
      }

      const position = computeSatellitePosition(satellite, currentTime);
      entity.show = Boolean(position);

      if (position) {
        entity.position = new ConstantPositionProperty(position.cartesian);
      }

      const coverage = coverageEntitiesRef.current.get(satelliteId);

      if (!coverage) {
        continue;
      }

      coverage.fill.show = Boolean(position);
      coverage.boundary.show = Boolean(position);

      if (position && coverage.fill.polygon && coverage.boundary.polyline) {
        const footprint = buildGeoCoverageFootprint(position);
        coverage.fill.polygon.hierarchy = new ConstantProperty(
          new PolygonHierarchy(footprint),
        );
        coverage.boundary.polyline.positions = new ConstantProperty(
          closeFootprint(footprint),
        );
      }
    }
  }, [currentTime, satellitesById]);

  useEffect(() => {
    for (const [satelliteId, entity] of satelliteEntitiesRef.current.entries()) {
      const satellite = satellitesById.get(satelliteId);

      if (!satellite || !entity.point) {
        continue;
      }

      const isSelected = satelliteId === selectedSatelliteId;
      const baseColor = ORBIT_COLORS[satellite.orbitType];
      entity.point.pixelSize = new ConstantProperty(isSelected ? 13 : 8);
      entity.point.outlineWidth = new ConstantProperty(isSelected ? 3 : 2);
      entity.point.color = new ConstantProperty(
        isSelected ? Color.WHITE : baseColor,
      );
    }

    for (const [satelliteId, entity] of orbitEntitiesRef.current.entries()) {
      const satellite = satellitesById.get(satelliteId);

      if (!satellite || !entity.polyline) {
        continue;
      }

      const isSelected = satelliteId === selectedSatelliteId;
      const baseColor = ORBIT_COLORS[satellite.orbitType];
      entity.polyline.width = new ConstantProperty(getOrbitWidth(isSelected));
      entity.polyline.material = getOrbitMaterial(baseColor, isSelected);
      entity.polyline.depthFailMaterial = getOrbitDepthMaterial(
        baseColor,
        isSelected,
      );
    }

    for (const [satelliteId, coverage] of coverageEntitiesRef.current.entries()) {
      const satellite = satellitesById.get(satelliteId);

      if (!satellite || !coverage.fill.polygon || !coverage.boundary.polyline) {
        continue;
      }

      const isSelected = satelliteId === selectedSatelliteId;
      const baseColor = ORBIT_COLORS[satellite.orbitType];
      coverage.fill.polygon.material = getCoverageFillMaterial(
        baseColor,
        isSelected,
      );
      coverage.boundary.polyline.width = new ConstantProperty(
        isSelected ? 2.2 : 1,
      );
      coverage.boundary.polyline.material = getCoverageBoundaryMaterial(
        baseColor,
        isSelected,
      );
    }
  }, [selectedSatelliteId, satellitesById]);

  return <div ref={containerRef} className="earth-scene" />;
}

function closeFootprint(footprint: Cartesian3[]): Cartesian3[] {
  return footprint.length > 0 ? [...footprint, footprint[0]] : footprint;
}

function getCoverageFillMaterial(color: Color, isSelected: boolean) {
  return new ColorMaterialProperty(color.withAlpha(isSelected ? 0.11 : 0.035));
}

function getCoverageBoundaryMaterial(color: Color, isSelected: boolean) {
  return new ColorMaterialProperty(color.withAlpha(isSelected ? 0.9 : 0.32));
}

function getOrbitMaterial(color: Color, isSelected: boolean) {
  return new PolylineGlowMaterialProperty({
    color: color.withAlpha(isSelected ? 0.95 : 0.36),
    glowPower: isSelected ? 0.16 : 0.06,
  });
}

function getOrbitDepthMaterial(color: Color, isSelected: boolean) {
  return new ColorMaterialProperty(color.withAlpha(isSelected ? 0.42 : 0.1));
}

function getOrbitWidth(isSelected: boolean): number {
  return isSelected ? 3.4 : 1.05;
}

function addReferenceGrid(viewer: Viewer) {
  const gridColor = Color.fromCssColorString("#4aa3c7").withAlpha(0.2);
  const height = 90_000;

  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const points: number[] = [];

    for (let longitude = -180; longitude <= 180; longitude += 4) {
      points.push(longitude, latitude, height);
    }

    viewer.entities.add({
      polyline: {
        arcType: ArcType.NONE,
        material: gridColor,
        positions: Cartesian3.fromDegreesArrayHeights(points),
        width: latitude === 0 ? 1.35 : 0.7,
      },
    });
  }

  for (let longitude = -180; longitude < 180; longitude += 30) {
    const points: number[] = [];

    for (let latitude = -80; latitude <= 80; latitude += 4) {
      points.push(longitude, latitude, height);
    }

    viewer.entities.add({
      polyline: {
        arcType: ArcType.NONE,
        material: gridColor,
        positions: Cartesian3.fromDegreesArrayHeights(points),
        width: 0.7,
      },
    });
  }
}
