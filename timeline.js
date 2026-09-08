(function timelineModule(root) {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const CHINA_OFFSET = 8 * HOUR;
  const RELATIVE_STAY_MINUTES = [30, 60, 120, 180, 240, 480, 600];

  function normaliseStayButtons(values) {
    return [...new Set(values || [])].map(Number).map((value) => ({ 1: 60, 2: 120, 8: 480, 10: 600 }[value] || value)).filter((value) => RELATIVE_STAY_MINUTES.includes(value));
  }
  function stayMinutes(selectedStayButtons) { return normaliseStayButtons(selectedStayButtons).reduce((total, value) => total + value, 0); }
  function addMinutes(date, minutes) { return new Date(date.getTime() + minutes * MINUTE); }
  function nextChinaClock(arrival, clock) {
    const match = String(clock || '').match(/^(09|10):00$/); if (!match) return null;
    const local = new Date(arrival.getTime() + CHINA_OFFSET);
    let target = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), Number(match[1]), 0, 0));
    target = new Date(target.getTime() - CHINA_OFFSET);
    if (target.getTime() < arrival.getTime()) target = new Date(target.getTime() + 24 * HOUR);
    return target;
  }
  function departureFor(arrival, destination) {
    const selectedStayButtons = normaliseStayButtons(destination.selectedStayButtons);
    const stayMode = destination.stayMode === 'until' && /^(09|10):00$/.test(destination.untilTime || '') ? 'until' : 'duration';
    if (stayMode === 'until') {
      const departure = nextChinaClock(arrival, destination.untilTime);
      return { selectedStayButtons, stayMode, untilTime: destination.untilTime, stayMinutes: Math.max(0, Math.round((departure.getTime() - arrival.getTime()) / MINUTE)), departure };
    }
    const minutes = stayMinutes(selectedStayButtons);
    return { selectedStayButtons, stayMode: 'duration', untilTime: null, stayMinutes: minutes, departure: addMinutes(arrival, minutes) };
  }

  /** One source of truth for active legs: skipped stops never consume a route or time. */
  function calculateTimeline(trip) {
    let departure = new Date(trip.initialDepartureTime);
    let routeChainIsComplete = !Number.isNaN(departure.getTime());
    let drivingSeconds = 0; let distanceMeters = 0; let totalStayMinutes = 0;
    const destinations = (trip.destinations || []).map((destination) => {
      const selectedStayButtons = normaliseStayButtons(destination.selectedStayButtons);
      if (destination.isSkipped) return { ...destination, selectedStayButtons, stayMinutes: 0, arrivalTime: null, departureTime: null, hasDepartureDisplay: false };
      const durationSeconds = destination.route ? Number(destination.route.durationSeconds) : Number.NaN;
      const canCalculate = routeChainIsComplete && Number.isFinite(durationSeconds) && durationSeconds >= 0;
      if (!canCalculate) { routeChainIsComplete = false; return { ...destination, selectedStayButtons, stayMinutes: 0, arrivalTime: null, departureTime: null, hasDepartureDisplay: false }; }
      const arrival = new Date(departure.getTime() + durationSeconds * 1000);
      const stop = departureFor(arrival, { ...destination, selectedStayButtons });
      drivingSeconds += durationSeconds; distanceMeters += Number(destination.route.distanceMeters) || 0; totalStayMinutes += stop.stayMinutes;
      departure = stop.departure;
      return { ...destination, selectedStayButtons, stayMode: stop.stayMode, untilTime: stop.untilTime, stayMinutes: stop.stayMinutes, arrivalTime: arrival.toISOString(), departureTime: stop.departure.toISOString(), hasDepartureDisplay: stop.stayMode === 'until' || stop.stayMinutes > 0 };
    });
    return {
      ...trip, destinations,
      summary: { drivingSeconds, distanceMeters, totalStayMinutes, totalDurationSeconds: drivingSeconds + totalStayMinutes * MINUTE, finalArrivalTime: destinations.length && routeChainIsComplete ? [...destinations].reverse().find((item) => !item.isSkipped)?.arrivalTime || null : null, routeChainIsComplete: destinations.some((item) => !item.isSkipped) && routeChainIsComplete }
    };
  }
  const api = { MINUTE, HOUR, RELATIVE_STAY_MINUTES, normaliseStayButtons, stayMinutes, nextChinaClock, calculateTimeline };
  if (typeof module !== 'undefined') module.exports = api;
  root.TripTimeline = api;
})(typeof window !== 'undefined' ? window : globalThis);
