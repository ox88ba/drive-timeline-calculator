(function solarPhotographyModule(root) {
  'use strict';
  // Compact solar-position calculation using the established SunCalc astronomical
  // equations. It calculates a geometric sunset with the standard -0.833°
  // apparent-horizon correction (solar radius + atmospheric refraction).
  const RAD = Math.PI / 180;
  const DAY_MS = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

  function toJulian(date) { return date.valueOf() / DAY_MS - 0.5 + J1970; }
  function fromJulian(julian) { return new Date((julian + 0.5 - J1970) * DAY_MS); }
  function toDays(date) { return toJulian(date) - J2000; }
  function solarMeanAnomaly(days) { return RAD * (357.5291 + 0.98560028 * days); }
  function eclipticLongitude(meanAnomaly) {
    const center = RAD * (1.9148 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly) + 0.0003 * Math.sin(3 * meanAnomaly));
    return meanAnomaly + center + Math.PI + RAD * 102.9372;
  }
  function declination(longitude, latitude) { return Math.asin(Math.sin(latitude) * Math.cos(RAD * 23.4397) + Math.cos(latitude) * Math.sin(RAD * 23.4397) * Math.sin(longitude)); }
  function julianCycle(days, lw) { return Math.round(days - 0.0009 - lw / (2 * Math.PI)); }
  function approxTransit(hourAngle, lw, n) { return 0.0009 + (hourAngle + lw) / (2 * Math.PI) + n; }
  function solarTransitJ(ds, meanAnomaly, longitude) { return J2000 + ds + 0.0053 * Math.sin(meanAnomaly) - 0.0069 * Math.sin(2 * longitude); }
  function hourAngle(altitude, phi, dec) { return Math.acos((Math.sin(altitude) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec))); }

  function chinaParts(value) {
    const shifted = new Date(new Date(value).getTime() + CHINA_OFFSET_MS);
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes(), second: shifted.getUTCSeconds() };
  }
  function chinaDateKey(value) {
    const parts = chinaParts(value); const pad = (number) => String(number).padStart(2, '0');
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }
  function chinaDateTimeToDate(value) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]) - 8, Number(match[5])));
  }
  function sunsetForChinaDate(dateKey, latitude, longitude) {
    const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return null;
    const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
    // Local noon is used to anchor the requested China civil date, independent
    // of the browser's own time zone.
    const localNoon = new Date(Date.UTC(year, month - 1, day, 4));
    const lw = -Number(longitude) * RAD;
    const phi = Number(latitude) * RAD;
    const days = toDays(localNoon);
    const n = julianCycle(days, lw);
    const ds = approxTransit(0, lw, n);
    const meanAnomaly = solarMeanAnomaly(ds);
    const longitudeEcliptic = eclipticLongitude(meanAnomaly);
    const dec = declination(longitudeEcliptic, 0);
    const angle = hourAngle(-0.833 * RAD, phi, dec);
    if (!Number.isFinite(angle)) return null;
    return fromJulian(solarTransitJ(approxTransit(angle, lw, n), meanAnomaly, longitudeEcliptic));
  }
  function sunriseForChinaDate(dateKey, latitude, longitude) {
    const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return null;
    const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
    const localNoon = new Date(Date.UTC(year, month - 1, day, 4));
    const lw = -Number(longitude) * RAD;
    const phi = Number(latitude) * RAD;
    const days = toDays(localNoon);
    const n = julianCycle(days, lw);
    const ds = approxTransit(0, lw, n);
    const meanAnomaly = solarMeanAnomaly(ds);
    const longitudeEcliptic = eclipticLongitude(meanAnomaly);
    const dec = declination(longitudeEcliptic, 0);
    const angle = hourAngle(-0.833 * RAD, phi, dec);
    if (!Number.isFinite(angle)) return null;
    return fromJulian(solarTransitJ(approxTransit(-angle, lw, n), meanAnomaly, longitudeEcliptic));
  }
  function classifyPhotography(deltaMinutes) {
    if (!Number.isFinite(deltaMinutes)) return null;
    if (deltaMinutes >= -50 && deltaMinutes < -10) return { kind: 'golden', icon: '☀', label: '黄金时刻' };
    if (deltaMinutes >= -10 && deltaMinutes <= 10) return { kind: 'sunset', icon: '🌅', label: '火烧云时刻' };
    if (deltaMinutes > 10 && deltaMinutes <= 35) return { kind: 'blue', icon: '🌌', label: '蓝调时刻' };
    return null;
  }

  const api = { CHINA_OFFSET_MS, chinaParts, chinaDateKey, chinaDateTimeToDate, sunriseForChinaDate, sunsetForChinaDate, classifyPhotography };
  if (typeof module !== 'undefined') module.exports = api;
  root.SolarPhotography = api;
})(typeof window !== 'undefined' ? window : globalThis);
