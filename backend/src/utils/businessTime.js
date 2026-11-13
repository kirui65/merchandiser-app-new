// Business dates follow Nairobi time (UTC+3, no daylight saving).
const BUSINESS_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Returns the business-local calendar parts for an instant.
function businessParts(date = new Date()) {
  const local = new Date(date.getTime() + BUSINESS_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
  };
}

// Start of a business-local calendar day as a real instant.
function businessDayStart(year, month, day) {
  return new Date(Date.UTC(year, month, day) - BUSINESS_OFFSET_MS);
}

function businessDateKey(date = new Date()) {
  const { year, month, day } = businessParts(date);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function businessMonthKey(date = new Date()) {
  return businessDateKey(date).slice(0, 7);
}

module.exports = { BUSINESS_OFFSET_MS, DAY_MS, businessParts, businessDayStart, businessDateKey, businessMonthKey };
