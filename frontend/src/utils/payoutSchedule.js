const TIME_ZONE = 'Africa/Johannesburg';
const DEFAULT_RELEASE_TIMES = ['10:00', '15:00'];
const DEFAULT_CUTOFF_TIMES = ['09:00', '14:00'];
const DEFAULT_CLEARING_DISCLAIMER = 'Bank clearing may take up to 2 business days depending on payment runs, weekends, and bank processing.';

function formatDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-ZA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function buildSaDate({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  return new Date(Date.UTC(year, month - 1, day, hour - 2, minute, second));
}

function startOfSaDay(date) {
  const parts = formatDateParts(date);
  return buildSaDate({ ...parts, hour: 0, minute: 0, second: 0 });
}

function parseHm(value) {
  const [hour, minute] = String(value).split(':').map(Number);
  return { hour, minute };
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function getHolidaySet(year) {
  const toKey = (date) => {
    const parts = formatDateParts(date);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  };
  const fixedDates = [
    [1, 1],
    [3, 21],
    [4, 27],
    [5, 1],
    [6, 16],
    [8, 9],
    [9, 24],
    [12, 16],
    [12, 25],
    [12, 26],
  ];

  const holidays = new Set(fixedDates.map(([month, day]) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`));
  const easter = easterSunday(year);
  const easterDate = new Date(Date.UTC(easter.year, easter.month - 1, easter.day, 12));
  holidays.add(toKey(new Date(easterDate.getTime() - 2 * 24 * 60 * 60 * 1000)));
  holidays.add(toKey(new Date(easterDate.getTime() + 1 * 24 * 60 * 60 * 1000)));

  Array.from(holidays).forEach((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    if (date.getUTCDay() === 0) {
      holidays.add(toKey(new Date(date.getTime() + 24 * 60 * 60 * 1000)));
    }
  });

  return holidays;
}

function isBusinessDay(date) {
  const parts = formatDateParts(date);
  const dayKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const utcDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
  if (utcDay === 0 || utcDay === 6) return false;
  return !getHolidaySet(parts.year).has(dayKey);
}

function nextBusinessDay(date) {
  let current = startOfSaDay(date);
  while (true) {
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    if (isBusinessDay(current)) return current;
  }
}

function localReleaseLabel(target, now) {
  const targetParts = formatDateParts(target);
  const nowParts = formatDateParts(now);
  const targetKey = `${targetParts.year}-${String(targetParts.month).padStart(2, '0')}-${String(targetParts.day).padStart(2, '0')}`;
  const nowKey = `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-${String(nowParts.day).padStart(2, '0')}`;
  let prefix = 'Today';
  if (targetKey !== nowKey) {
    const dayDiff = Math.round((startOfSaDay(target).getTime() - startOfSaDay(now).getTime()) / (24 * 60 * 60 * 1000));
    if (dayDiff === 1) prefix = 'Tomorrow';
    else prefix = new Intl.DateTimeFormat('en-ZA', { timeZone: TIME_ZONE, weekday: 'long' }).format(target);
  }
  return `${prefix} ${String(targetParts.hour).padStart(2, '0')}:${String(targetParts.minute).padStart(2, '0')}`;
}

function normalizeList(values, fallback) {
  const list = Array.isArray(values) && values.length ? values : fallback;
  return list.filter(Boolean);
}

export function getNextPayoutRelease(now = new Date(), config = {}) {
  const releaseTimes = normalizeList(config.payout_release_times, DEFAULT_RELEASE_TIMES);
  const cutoffTimes = normalizeList(config.payout_cutoff_times, DEFAULT_CUTOFF_TIMES);
  const localNow = now;
  const parts = formatDateParts(localNow);
  const minutes = parts.hour * 60 + parts.minute;
  const release10 = parseHm(releaseTimes[0]);
  const release15 = parseHm(releaseTimes[1] || releaseTimes[0]);
  const cutoff10 = parseHm(cutoffTimes[0]);
  const cutoff15 = parseHm(cutoffTimes[1] || cutoffTimes[0]);
  const cutoff10Minutes = cutoff10.hour * 60 + cutoff10.minute;
  const cutoff15Minutes = cutoff15.hour * 60 + cutoff15.minute;

  let target;
  if (!isBusinessDay(localNow)) {
    const nextDay = nextBusinessDay(localNow);
    target = buildSaDate({ ...formatDateParts(nextDay), hour: release10.hour, minute: release10.minute, second: 0 });
  } else if (minutes < cutoff10Minutes) {
    target = buildSaDate({ ...parts, hour: release10.hour, minute: release10.minute, second: 0 });
  } else if (minutes < cutoff15Minutes) {
    target = buildSaDate({ ...parts, hour: release15.hour, minute: release15.minute, second: 0 });
  } else {
    const nextDay = nextBusinessDay(localNow);
    target = buildSaDate({ ...formatDateParts(nextDay), hour: release10.hour, minute: release10.minute, second: 0 });
  }

  const isWeekendOrHoliday = !isBusinessDay(localNow);
  const releaseLabel = localReleaseLabel(target, localNow);
  const headline = isWeekendOrHoliday ? `Weekend payout: next business day` : `Next payout release: ${releaseLabel}`;

  return {
    releaseAt: target.toISOString(),
    releaseLabel,
    headline,
    isBusinessDay: !isWeekendOrHoliday,
    releaseTimes,
    cutoffTimes,
  };
}

export function getPayoutScheduleMessage(now = new Date(), config = {}) {
  const summary = getNextPayoutRelease(now, config);
  const disclaimer = config.payout_clearing_disclaimer || DEFAULT_CLEARING_DISCLAIMER;
  return {
    ...summary,
    disclaimer,
    copy: `${summary.headline}. ${disclaimer}`,
    shortCopy: summary.headline,
  };
}

export function getDefaultMinimumTransactionAmount(config = {}) {
  const value = Number(config.minimum_transaction);
  return Number.isFinite(value) && value > 0 ? value : 500;
}

export function getPayoutClearingDisclaimer(config = {}) {
  return config.payout_clearing_disclaimer || DEFAULT_CLEARING_DISCLAIMER;
}

export function calculatePayoutSchedule(releasedAt, config = {}) {
  const releasedDate = new Date(releasedAt);
  const releaseParts = formatDateParts(releasedDate);
  const releaseMinutes = releaseParts.hour * 60 + releaseParts.minute;

  const releaseTimes = normalizeList(config.payout_release_times, DEFAULT_RELEASE_TIMES);
  const release10 = parseHm(releaseTimes[0]);
  const release15 = parseHm(releaseTimes[1] || releaseTimes[0]);
  const threshold10 = release10.hour * 60 + release10.minute;
  const threshold15 = release15.hour * 60 + release15.minute;

  let payoutRunAt;

  if (!isBusinessDay(releasedDate) || releaseMinutes >= threshold15) {
    const nextBiz = nextBusinessDay(releasedDate);
    const nextNextBiz = nextBusinessDay(nextBiz);
    payoutRunAt = buildSaDate({ ...formatDateParts(nextNextBiz), hour: release10.hour, minute: release10.minute, second: 0 });
  } else if (releaseMinutes >= threshold10) {
    const nextBiz = nextBusinessDay(releasedDate);
    payoutRunAt = buildSaDate({ ...formatDateParts(nextBiz), hour: release15.hour, minute: release15.minute, second: 0 });
  } else {
    const nextBiz = nextBusinessDay(releasedDate);
    payoutRunAt = buildSaDate({ ...formatDateParts(nextBiz), hour: release10.hour, minute: release10.minute, second: 0 });
  }

  const pp = formatDateParts(payoutRunAt);
  const bankRunLabel = `${String(pp.hour).padStart(2, '0')}:${String(pp.minute).padStart(2, '0')}`;

  return { payoutRunAt, bankRunLabel };
}
