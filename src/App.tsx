import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Satellite,
  Search,
  Signal,
  WifiOff,
} from "lucide-react";
import "./App.css";
import { EarthScene } from "./components/EarthScene";
import { fetchBeidouSatellites } from "./lib/tle";
import type { TleDataSource } from "./lib/tle";
import {
  computeSatellitePosition,
  formatCoordinate,
  geoCoverageMinElevationDeg,
  orbitalPeriodHours,
} from "./lib/orbit";
import type {
  OrbitType,
  SatelliteRecord,
  SatelliteSortMode,
  SimulationState,
} from "./types";

const ORBIT_META: Record<OrbitType, { label: string; color: string }> = {
  GEO: { label: "GEO", color: "#29d3ff" },
  IGSO: { label: "IGSO", color: "#ffc857" },
  MEO: { label: "MEO", color: "#65f2a4" },
};

const SPEED_OPTIONS = [1, 60, 600, 3600];
const SORT_OPTIONS: Array<{ label: string; value: SatelliteSortMode }> = [
  { label: "近到远", value: "launch-desc" },
  { label: "远到近", value: "launch-asc" },
  { label: "轨道", value: "orbit" },
  { label: "名称", value: "name" },
];

const initialSimulationState: SimulationState = {
  currentTime: new Date(),
  isPlaying: true,
  speedMultiplier: 600,
  activeOrbitTypes: {
    GEO: true,
    IGSO: true,
    MEO: true,
  },
  searchQuery: "",
  sortMode: "launch-desc",
  selectedSatelliteId: null,
};

export default function App() {
  const [satellites, setSatellites] = useState<SatelliteRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<TleDataSource | null>(null);
  const [simulation, setSimulation] = useState<SimulationState>(
    initialSimulationState,
  );

  useEffect(() => {
    let isMounted = true;

    async function loadSatellites() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const { records, source } = await fetchBeidouSatellites();

        if (!isMounted) {
          return;
        }

        setSatellites(records);
        setDataSource(source);
        setLoadedAt(new Date());
        setSimulation((current) => ({
          ...current,
          selectedSatelliteId: current.selectedSatelliteId ?? records[0]?.id ?? null,
        }));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "北斗轨道数据加载失败",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadSatellites();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let previousTime = performance.now();
    let remainderMs = 0;

    function tick(now: number) {
      const elapsedMs = now - previousTime;
      previousTime = now;

      setSimulation((current) => {
        if (!current.isPlaying) {
          return current;
        }

        remainderMs += elapsedMs * current.speedMultiplier;

        if (remainderMs < 250) {
          return current;
        }

        const stepMs = remainderMs;
        remainderMs = 0;

        return {
          ...current,
          currentTime: new Date(current.currentTime.getTime() + stepMs),
        };
      });

      animationFrame = requestAnimationFrame(tick);
    }

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const visibleSatellites = useMemo(() => {
    const query = simulation.searchQuery.trim().toLowerCase();

    return satellites
      .filter((satellite) => {
        const matchesType = simulation.activeOrbitTypes[satellite.orbitType];
        const matchesQuery =
          query.length === 0 ||
          satellite.name.toLowerCase().includes(query) ||
          satellite.noradId.includes(query) ||
          Boolean(satellite.objectId?.toLowerCase().includes(query)) ||
          Boolean(satellite.officialLaunchDate?.includes(query)) ||
          Boolean(satellite.launchDate?.includes(query)) ||
          Boolean(satellite.launchSite?.toLowerCase().includes(query));

        return matchesType && matchesQuery;
      })
      .sort((left, right) => compareSatellites(left, right, simulation.sortMode));
  }, [
    satellites,
    simulation.activeOrbitTypes,
    simulation.searchQuery,
    simulation.sortMode,
  ]);

  const selectedSatellite = useMemo(
    () =>
      satellites.find(
        (satellite) => satellite.id === simulation.selectedSatelliteId,
      ) ?? null,
    [satellites, simulation.selectedSatelliteId],
  );

  const selectedPosition = useMemo(
    () =>
      selectedSatellite
        ? computeSatellitePosition(selectedSatellite, simulation.currentTime)
        : null,
    [selectedSatellite, simulation.currentTime],
  );

  const counts = useMemo(() => {
    return satellites.reduce(
      (accumulator, satellite) => {
        accumulator[satellite.orbitType] += 1;
        return accumulator;
      },
      { GEO: 0, IGSO: 0, MEO: 0 } as Record<OrbitType, number>,
    );
  }, [satellites]);

  const statusCounts = useMemo(() => {
    return satellites.reduce(
      (accumulator, satellite) => {
        if (satellite.opsStatusCode === "+") {
          accumulator.operational += 1;
        } else if (satellite.opsStatusCode === "S") {
          accumulator.spare += 1;
        }

        return accumulator;
      },
      { operational: 0, spare: 0 },
    );
  }, [satellites]);

  function updateSimulation(partial: Partial<SimulationState>) {
    setSimulation((current) => ({
      ...current,
      ...partial,
    }));
  }

  function toggleOrbitType(type: OrbitType) {
    setSimulation((current) => ({
      ...current,
      activeOrbitTypes: {
        ...current.activeOrbitTypes,
        [type]: !current.activeOrbitTypes[type],
      },
    }));
  }

  function selectSatellite(satelliteId: string) {
    updateSimulation({ selectedSatelliteId: satelliteId });
  }

  return (
    <main className="app-shell">
      <EarthScene
        currentTime={simulation.currentTime}
        onSelectSatellite={selectSatellite}
        satellites={visibleSatellites}
        selectedSatelliteId={simulation.selectedSatelliteId}
      />

      <section className="top-bar" aria-label="状态栏">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Satellite size={18} aria-hidden="true" />
          </div>
          <div>
            <h1>北斗三维星座态势</h1>
            <p>TLE / SGP4</p>
          </div>
        </div>

        <div className="status-cluster">
          <StatusPill
            icon={
              isLoading ? (
                <Loader2 className="spin" size={14} aria-hidden="true" />
              ) : errorMessage ? (
                <WifiOff size={14} aria-hidden="true" />
              ) : (
                <Signal size={14} aria-hidden="true" />
              )
            }
            label={
              isLoading
                ? "加载中"
                : errorMessage
                  ? "数据异常"
                  : dataSource === "snapshot"
                    ? "缓存数据"
                    : "在线数据"
            }
            tone={errorMessage ? "danger" : "normal"}
          />
          <StatusPill label={`${satellites.length} 颗轨道对象`} tone="normal" />
          <StatusPill label={`${statusCounts.operational} 运行`} tone="normal" />
          <StatusPill label={`${statusCounts.spare} 备用`} tone="normal" />
          <StatusPill
            icon={<Clock3 size={14} aria-hidden="true" />}
            label={formatDateTime(simulation.currentTime)}
            tone="normal"
          />
        </div>
      </section>

      <aside className="control-panel" aria-label="星座控制面板">
        <div className="field-row search-row">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="搜索卫星"
            placeholder="搜索名称或 NORAD"
            type="search"
            value={simulation.searchQuery}
            onChange={(event) =>
              updateSimulation({ searchQuery: event.currentTarget.value })
            }
          />
        </div>

        <div className="panel-block">
          <div className="panel-heading">轨道类型</div>
          <div className="orbit-filter-grid">
            {(Object.keys(ORBIT_META) as OrbitType[]).map((type) => (
              <button
                className={`orbit-toggle ${
                  simulation.activeOrbitTypes[type] ? "is-active" : ""
                }`}
                key={type}
                onClick={() => toggleOrbitType(type)}
                type="button"
              >
                <span
                  className="color-swatch"
                  style={{ backgroundColor: ORBIT_META[type].color }}
                />
                <span>{ORBIT_META[type].label}</span>
                <strong>{counts[type]}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="panel-block">
          <div className="panel-heading">时间控制</div>
          <div className="transport-row">
            <button
              className="icon-command primary-command"
              onClick={() =>
                updateSimulation({ isPlaying: !simulation.isPlaying })
              }
              type="button"
            >
              {simulation.isPlaying ? (
                <Pause size={16} aria-hidden="true" />
              ) : (
                <Play size={16} aria-hidden="true" />
              )}
              <span>{simulation.isPlaying ? "暂停" : "播放"}</span>
            </button>
            <button
              className="icon-command"
              onClick={() => updateSimulation({ currentTime: new Date() })}
              type="button"
            >
              <RotateCcw size={16} aria-hidden="true" />
              <span>现在</span>
            </button>
          </div>

          <div className="speed-grid" aria-label="时间倍率">
            {SPEED_OPTIONS.map((speed) => (
              <button
                className={speed === simulation.speedMultiplier ? "is-active" : ""}
                key={speed}
                onClick={() => updateSimulation({ speedMultiplier: speed })}
                type="button"
              >
                {speed >= 3600 ? `${speed / 3600}h/s` : `${speed}x`}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-block satellite-list-block">
          <div className="panel-heading">
            <span>卫星列表</span>
            <span>{visibleSatellites.length}</span>
          </div>
          <div className="sort-row" aria-label="卫星排序">
            {SORT_OPTIONS.map((option) => (
              <button
                className={option.value === simulation.sortMode ? "is-active" : ""}
                key={option.value}
                onClick={() => updateSimulation({ sortMode: option.value })}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="satellite-list">
            {visibleSatellites.map((satellite) => (
              <button
                className={`satellite-row ${
                  satellite.id === simulation.selectedSatelliteId ? "is-selected" : ""
                }`}
                key={satellite.id}
                onClick={() => selectSatellite(satellite.id)}
                type="button"
              >
                <span
                  className="color-swatch"
                  style={{ backgroundColor: ORBIT_META[satellite.orbitType].color }}
                />
                <span className="satellite-copy">
                  <span className="satellite-name">{satellite.name}</span>
                  <span className="satellite-launch">
                    发射 {formatLaunchDate(satellite)}
                    {satellite.launchSite
                      ? ` · ${formatLaunchSite(satellite.launchSite)}`
                      : ""}
                  </span>
                </span>
                <span className="satellite-badges">
                  <span className="satellite-type">{satellite.orbitType}</span>
                  {satellite.opsStatusCode ? (
                    <span className="satellite-status">
                      {formatOpsStatus(satellite.opsStatusCode)}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <aside className="detail-panel" aria-label="卫星详情">
        <div className="panel-heading">卫星详情</div>
        {selectedSatellite ? (
          <div className="detail-stack">
            <div>
              <h2>{selectedSatellite.name}</h2>
              <div className="detail-tags">
                <span
                  style={{
                    borderColor: ORBIT_META[selectedSatellite.orbitType].color,
                    color: ORBIT_META[selectedSatellite.orbitType].color,
                  }}
                >
                  {selectedSatellite.orbitType}
                </span>
                <span>NORAD {selectedSatellite.noradId}</span>
                {selectedSatellite.objectId ? (
                  <span>{selectedSatellite.objectId}</span>
                ) : null}
                {selectedSatellite.opsStatusCode ? (
                  <span>{formatOpsStatus(selectedSatellite.opsStatusCode)}</span>
                ) : null}
              </div>
            </div>

            <div className="metrics-grid">
              <Metric
                label="经度"
                value={
                  selectedPosition
                    ? formatCoordinate(selectedPosition.longitudeDeg, "lon")
                    : "-"
                }
              />
              <Metric
                label="纬度"
                value={
                  selectedPosition
                    ? formatCoordinate(selectedPosition.latitudeDeg, "lat")
                    : "-"
                }
              />
              <Metric
                label="高度"
                value={
                  selectedPosition
                    ? `${selectedPosition.altitudeKm.toLocaleString("zh-CN", {
                        maximumFractionDigits: 0,
                      })} km`
                    : "-"
                }
              />
              <Metric
                label="周期"
                value={`${orbitalPeriodHours(selectedSatellite).toFixed(2)} h`}
              />
              <Metric
                label="倾角"
                value={`${selectedSatellite.inclinationDeg.toFixed(2)}°`}
              />
              <Metric
                label="发射时间"
                value={formatLaunchDate(selectedSatellite)}
              />
              <Metric
                label="发射场"
                value={
                  selectedSatellite.launchSite
                    ? formatLaunchSite(selectedSatellite.launchSite)
                    : "-"
                }
              />
              {selectedSatellite.orbitType === "GEO" ? (
                <Metric
                  label="GEO覆盖"
                  value={`${geoCoverageMinElevationDeg()}°仰角几何足迹`}
                />
              ) : null}
              <Metric
                label="TLE 历元"
                value={
                  selectedSatellite.epoch
                    ? formatDate(selectedSatellite.epoch)
                    : "-"
                }
              />
            </div>
          </div>
        ) : (
          <div className="empty-detail">未选中</div>
        )}
      </aside>

      <div className="data-footnote">
        <span>
          发射日期按北斗官网北京时间；轨道用 TLE/SATCAT；GEO覆盖为几何足迹，非官方业务波束
        </span>
        <span>
          {loadedAt
            ? `${dataSource === "snapshot" ? "缓存" : "更新"} ${formatDateTime(
                loadedAt,
              )}`
            : "等待数据"}
        </span>
      </div>

      {(isLoading || errorMessage) && (
        <div className="state-overlay" role="status">
          <div className="state-panel">
            {isLoading ? (
              <>
                <Loader2 className="spin" size={22} aria-hidden="true" />
                <span>正在加载北斗轨道数据</span>
              </>
            ) : (
              <>
                <WifiOff size={22} aria-hidden="true" />
                <span>{errorMessage}</span>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function formatLaunchDate(satellite: SatelliteRecord): string {
  if (satellite.officialLaunchDate) {
    return formatDateFromIso(satellite.officialLaunchDate);
  }

  if (satellite.launchDate) {
    return formatDateFromIso(satellite.launchDate);
  }

  const launchYear = satellite.objectId?.slice(0, 4);
  return launchYear && /^\d{4}$/.test(launchYear) ? `${launchYear} 年` : "-";
}

function compareSatellites(
  left: SatelliteRecord,
  right: SatelliteRecord,
  sortMode: SatelliteSortMode,
): number {
  if (sortMode === "launch-desc" || sortMode === "launch-asc") {
    const direction = sortMode === "launch-desc" ? -1 : 1;
    const launchOrder =
      direction * (launchTime(left) - launchTime(right)) ||
      compareObjectId(left, right);

    if (launchOrder !== 0) {
      return launchOrder;
    }
  }

  if (sortMode === "orbit") {
    const orbitOrder =
      orbitSortOrder(left.orbitType) - orbitSortOrder(right.orbitType);

    if (orbitOrder !== 0) {
      return orbitOrder;
    }
  }

  return left.name.localeCompare(right.name, "zh-CN");
}

function launchTime(satellite: SatelliteRecord): number {
  const launchDate = satellite.officialLaunchDate ?? satellite.launchDate;

  if (!launchDate) {
    return 0;
  }

  const timestamp = Date.parse(`${launchDate}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareObjectId(left: SatelliteRecord, right: SatelliteRecord): number {
  const leftId = left.objectId ?? "";
  const rightId = right.objectId ?? "";
  return rightId.localeCompare(leftId, "zh-CN") || left.name.localeCompare(right.name);
}

function orbitSortOrder(type: OrbitType): number {
  return type === "GEO" ? 0 : type === "IGSO" ? 1 : 2;
}

function formatOpsStatus(code: string): string {
  if (code === "+") {
    return "运行";
  }

  if (code === "S") {
    return "备用";
  }

  return code;
}

function formatLaunchSite(code: string): string {
  if (code === "XICLF") {
    return "西昌";
  }

  return code;
}

function StatusPill({
  icon,
  label,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  tone: "normal" | "danger";
}) {
  return (
    <div className={`status-pill ${tone}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateFromIso(value: string): string {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${year}/${month}/${day}`;
}
