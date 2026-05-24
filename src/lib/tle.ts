import { twoline2satrec } from "satellite.js";
import type { OrbitType, SatelliteRecord } from "../types";

export const BEIDOU_TLE_URL =
  "/celestrak/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle";
const BEIDOU_SATCAT_URL =
  "/celestrak/satcat/records.php?GROUP=beidou&FORMAT=json";
const BEIDOU_TLE_SNAPSHOT_URL = "/data/beidou.tle";
const BEIDOU_SATCAT_SNAPSHOT_URL = "/data/beidou-satcat.json";

export type TleDataSource = "live" | "snapshot";

export interface BeidouTleResult {
  records: SatelliteRecord[];
  source: TleDataSource;
}

export async function fetchBeidouSatellites(): Promise<BeidouTleResult> {
  try {
    return {
      records: await fetchAndEnrichSatellites(BEIDOU_TLE_URL, [
        BEIDOU_SATCAT_URL,
        BEIDOU_SATCAT_SNAPSHOT_URL,
      ]),
      source: "live",
    };
  } catch (liveError) {
    try {
      return {
        records: await fetchAndEnrichSatellites(BEIDOU_TLE_SNAPSHOT_URL, [
          BEIDOU_SATCAT_SNAPSHOT_URL,
        ]),
        source: "snapshot",
      };
    } catch {
      throw liveError instanceof Error
        ? liveError
        : new Error("北斗轨道数据加载失败");
    }
  }
}

async function fetchAndEnrichSatellites(
  tleUrl: string,
  satcatUrls: string[],
): Promise<SatelliteRecord[]> {
  const records = await fetchAndParseTle(tleUrl);
  const metadataByNorad = await fetchSatcatMetadata(satcatUrls);

  return records.map((record) => {
    const metadata = metadataByNorad.get(record.noradId);

    if (!metadata) {
      return record;
    }

    return {
      ...record,
      objectId: metadata.objectId ?? record.objectId,
      launchDate: metadata.launchDate ?? record.launchDate,
      officialLaunchDate:
        officialLaunchDateByNorad[record.noradId] ?? record.officialLaunchDate,
      launchSite: metadata.launchSite ?? record.launchSite,
      opsStatusCode: metadata.opsStatusCode ?? record.opsStatusCode,
    };
  });
}

async function fetchAndParseTle(url: string): Promise<SatelliteRecord[]> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`${url} 返回 ${response.status}`);
  }

  const text = await response.text();
  const records = parseTleCatalog(text);

  if (records.length === 0) {
    throw new Error("没有解析到北斗 TLE 数据");
  }

  return records;
}

export function parseTleCatalog(text: string): SatelliteRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const records: SatelliteRecord[] = [];

  for (let index = 0; index < lines.length; ) {
    const maybeName = lines[index];
    const line1 = maybeName.startsWith("1 ") ? maybeName : lines[index + 1];
    const line2 = maybeName.startsWith("1 ") ? lines[index + 1] : lines[index + 2];
    const name = maybeName.startsWith("1 ")
      ? `NORAD ${line1?.slice(2, 7).trim() ?? ""}`
      : maybeName;

    if (!line1?.startsWith("1 ") || !line2?.startsWith("2 ")) {
      index += 1;
      continue;
    }

    const noradId = line1.slice(2, 7).trim();
    const objectId = parseObjectId(line1);
    const inclinationDeg = parseFloat(line2.slice(8, 16));
    const meanMotionRevPerDay = parseFloat(line2.slice(52, 63));
    const satrec = twoline2satrec(line1, line2);

    records.push({
      id: noradId,
      noradId,
      objectId,
      name: name.replace(/\s+/g, " ").trim(),
      orbitType: classifyOrbitType(name, inclinationDeg, meanMotionRevPerDay),
      launchDate: null,
      officialLaunchDate: officialLaunchDateByNorad[noradId] ?? null,
      launchSite: null,
      opsStatusCode: null,
      tle1: line1,
      tle2: line2,
      satrec,
      epoch: parseTleEpoch(line1),
      inclinationDeg,
      meanMotionRevPerDay,
    });

    index += maybeName.startsWith("1 ") ? 2 : 3;
  }

  return records.sort((a, b) => {
    const order = orbitOrder(a.orbitType) - orbitOrder(b.orbitType);
    return order || a.name.localeCompare(b.name, "zh-CN");
  });
}

interface SatcatMetadata {
  objectId: string | null;
  launchDate: string | null;
  launchSite: string | null;
  opsStatusCode: string | null;
}

interface SatcatRecord {
  OBJECT_ID?: unknown;
  NORAD_CAT_ID?: unknown;
  LAUNCH_DATE?: unknown;
  LAUNCH_SITE?: unknown;
  OPS_STATUS_CODE?: unknown;
}

async function fetchSatcatMetadata(
  urls: string[],
): Promise<Map<string, SatcatMetadata>> {
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as unknown;

      if (!Array.isArray(payload)) {
        continue;
      }

      const metadataByNorad = new Map<string, SatcatMetadata>();

      for (const item of payload as SatcatRecord[]) {
        const noradId =
          typeof item.NORAD_CAT_ID === "number"
            ? String(item.NORAD_CAT_ID)
            : typeof item.NORAD_CAT_ID === "string"
              ? item.NORAD_CAT_ID
              : null;

        if (!noradId) {
          continue;
        }

        metadataByNorad.set(noradId, {
          objectId: typeof item.OBJECT_ID === "string" ? item.OBJECT_ID : null,
          launchDate:
            typeof item.LAUNCH_DATE === "string" && item.LAUNCH_DATE.length > 0
              ? item.LAUNCH_DATE
              : null,
          launchSite:
            typeof item.LAUNCH_SITE === "string" && item.LAUNCH_SITE.length > 0
              ? item.LAUNCH_SITE
              : null,
          opsStatusCode:
            typeof item.OPS_STATUS_CODE === "string" &&
            item.OPS_STATUS_CODE.length > 0
              ? item.OPS_STATUS_CODE
              : null,
        });
      }

      if (metadataByNorad.size > 0) {
        return metadataByNorad;
      }
    } catch {
      continue;
    }
  }

  return new Map();
}

function parseObjectId(line1: string): string | null {
  const internationalDesignator = line1.slice(9, 17).trim();
  const match = internationalDesignator.match(/^(\d{2})(\d{3})([A-Z]{1,3})$/);

  if (!match) {
    return null;
  }

  const [, shortYear, launchNumber, launchPiece] = match;
  const year = Number(shortYear);
  const fullYear = year >= 57 ? 1900 + year : 2000 + year;
  return `${fullYear}-${launchNumber}${launchPiece}`;
}

function classifyOrbitType(
  name: string,
  inclinationDeg: number,
  meanMotionRevPerDay: number,
): OrbitType {
  const normalized = name.toUpperCase();

  if (normalized.includes("IGSO")) {
    return "IGSO";
  }

  if (/\bM\d+/.test(normalized) || normalized.includes(" MEO")) {
    return "MEO";
  }

  if (/\bG\d+/.test(normalized) || normalized.includes(" GEO")) {
    return "GEO";
  }

  if (meanMotionRevPerDay > 1.35) {
    return "MEO";
  }

  return inclinationDeg > 15 ? "IGSO" : "GEO";
}

function parseTleEpoch(line1: string): Date | null {
  const yearToken = line1.slice(18, 20);
  const dayToken = line1.slice(20, 32);
  const epochYear = Number.parseInt(yearToken, 10);
  const epochDay = Number.parseFloat(dayToken);

  if (!Number.isFinite(epochYear) || !Number.isFinite(epochDay)) {
    return null;
  }

  const fullYear = epochYear >= 57 ? 1900 + epochYear : 2000 + epochYear;
  const startOfYear = Date.UTC(fullYear, 0, 1, 0, 0, 0, 0);
  return new Date(startOfYear + (epochDay - 1) * 86_400_000);
}

function orbitOrder(type: OrbitType): number {
  return type === "GEO" ? 0 : type === "IGSO" ? 1 : 2;
}

const officialLaunchDateByNorad: Record<string, string> = {
  36828: "2010-08-01",
  37210: "2010-11-01",
  37256: "2010-12-18",
  37384: "2011-04-10",
  37763: "2011-07-27",
  37948: "2011-12-02",
  38091: "2012-02-25",
  38250: "2012-04-30",
  38251: "2012-04-30",
  38775: "2012-09-19",
  38953: "2012-10-25",
  40549: "2015-03-30",
  40748: "2015-07-25",
  40749: "2015-07-25",
  40938: "2015-09-30",
  41434: "2016-03-30",
  41586: "2016-06-12",
  43001: "2017-11-05",
  43002: "2017-11-05",
  43107: "2018-01-12",
  43108: "2018-01-12",
  43207: "2018-02-12",
  43208: "2018-02-12",
  43245: "2018-03-30",
  43246: "2018-03-30",
  43539: "2018-07-10",
  43581: "2018-07-29",
  43582: "2018-07-29",
  43602: "2018-08-25",
  43603: "2018-08-25",
  43622: "2018-09-19",
  43623: "2018-09-19",
  43647: "2018-10-15",
  43648: "2018-10-15",
  43683: "2018-11-01",
  43706: "2018-11-19",
  43707: "2018-11-19",
  44204: "2019-04-20",
  44231: "2019-05-17",
  44337: "2019-06-25",
  44542: "2019-09-23",
  44543: "2019-09-23",
  44709: "2019-11-05",
  44793: "2019-11-23",
  44794: "2019-11-23",
  44864: "2019-12-16",
  44865: "2019-12-16",
  45344: "2020-03-09",
  45807: "2020-06-23",
  56564: "2023-05-17",
  58654: "2023-12-26",
  58655: "2023-12-26",
  61186: "2024-09-19",
  61187: "2024-09-19",
};
