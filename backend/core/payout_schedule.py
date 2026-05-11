"""
Payout schedule helpers for TradeSafe release windows.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable, List


DEFAULT_TIMEZONE_OFFSET_HOURS = 2


def _sa_now(now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone(timedelta(hours=DEFAULT_TIMEZONE_OFFSET_HOURS)))


def _parse_hhmm(value: str) -> tuple[int, int]:
    hours, minutes = value.split(":", 1)
    return int(hours), int(minutes)


def _easter_sunday(year: int) -> datetime:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return datetime(year, month, day, tzinfo=timezone(timedelta(hours=DEFAULT_TIMEZONE_OFFSET_HOURS)))


def get_south_african_public_holidays(year: int) -> set[str]:
    easter = _easter_sunday(year)
    fixed_dates = [
        (1, 1),   # New Year's Day
        (3, 21),  # Human Rights Day
        (4, 27),  # Freedom Day
        (5, 1),   # Workers' Day
        (6, 16),  # Youth Day
        (8, 9),   # National Women's Day
        (9, 24),  # Heritage Day
        (12, 16), # Day of Reconciliation
        (12, 25), # Christmas Day
        (12, 26), # Day of Goodwill
    ]

    holiday_dates = {f"{year}-{month:02d}-{day:02d}" for month, day in fixed_dates}
    holiday_dates.add((easter - timedelta(days=2)).date().isoformat())
    holiday_dates.add((easter + timedelta(days=1)).date().isoformat())

    observed = set()
    for item in list(holiday_dates):
        holiday_date = datetime.fromisoformat(item).replace(tzinfo=timezone(timedelta(hours=DEFAULT_TIMEZONE_OFFSET_HOURS)))
        if holiday_date.weekday() == 6:  # Sunday
            observed.add((holiday_date + timedelta(days=1)).date().isoformat())

    return holiday_dates | observed


def is_business_day(date: datetime) -> bool:
    local = _sa_now(date)
    if local.weekday() >= 5:
        return False
    holidays = get_south_african_public_holidays(local.year)
    return local.date().isoformat() not in holidays


def next_business_day(date: datetime) -> datetime:
    local = _sa_now(date)
    next_day = local
    while True:
        next_day = next_day + timedelta(days=1)
        if is_business_day(next_day):
            return next_day


def _normalize_times(times: Iterable[str] | None, fallback: List[str]) -> List[str]:
    values = list(times or fallback)
    return [time for time in values if time]


def get_next_payout_release(
    now: datetime | None = None,
    release_times: Iterable[str] | None = None,
    cutoff_times: Iterable[str] | None = None,
) -> dict:
    """
    Calculate the next payout release window using South African business-day rules.
    """
    local_now = _sa_now(now)
    releases = _normalize_times(release_times, ["10:00", "15:00"])
    cutoffs = _normalize_times(cutoff_times, ["09:00", "14:00"])

    release_10 = _parse_hhmm(releases[0])
    release_15 = _parse_hhmm(releases[1] if len(releases) > 1 else releases[0])
    cutoff_10 = _parse_hhmm(cutoffs[0])
    cutoff_15 = _parse_hhmm(cutoffs[1] if len(cutoffs) > 1 else cutoffs[0])

    current_minutes = local_now.hour * 60 + local_now.minute
    cutoff_10_minutes = cutoff_10[0] * 60 + cutoff_10[1]
    cutoff_15_minutes = cutoff_15[0] * 60 + cutoff_15[1]

    if not is_business_day(local_now):
        target_date = next_business_day(local_now)
        target = target_date.replace(hour=release_10[0], minute=release_10[1], second=0, microsecond=0)
    elif current_minutes < cutoff_10_minutes:
        target = local_now.replace(hour=release_10[0], minute=release_10[1], second=0, microsecond=0)
    elif current_minutes < cutoff_15_minutes:
        target = local_now.replace(hour=release_15[0], minute=release_15[1], second=0, microsecond=0)
    else:
        target_date = next_business_day(local_now)
        target = target_date.replace(hour=release_10[0], minute=release_10[1], second=0, microsecond=0)

    if target <= local_now:
        target = target + timedelta(days=1)
        while not is_business_day(target):
            target = target + timedelta(days=1)
        target = target.replace(hour=release_10[0], minute=release_10[1], second=0, microsecond=0)

    return {
        "release_at": target.isoformat(),
        "label": format_release_label(target, local_now),
        "business_day": is_business_day(local_now),
        "timezone": "Africa/Johannesburg",
        "release_times": releases,
        "cutoff_times": cutoffs,
    }


def format_release_label(target: datetime, now: datetime | None = None) -> str:
    local_now = _sa_now(now)
    local_target = _sa_now(target)
    days_ahead = (local_target.date() - local_now.date()).days

    if days_ahead <= 0:
        prefix = "Today"
    elif days_ahead == 1:
        prefix = "Tomorrow"
    elif days_ahead < 7:
        prefix = local_target.strftime("%A")
    else:
        prefix = local_target.strftime("%d %b")

    return f"{prefix} {local_target.strftime('%H:%M')}"


def build_payout_schedule_summary(
    now: datetime | None = None,
    *,
    release_times: Iterable[str] | None = None,
    cutoff_times: Iterable[str] | None = None,
    clearing_disclaimer: str = "Bank clearing may take up to 2 business days depending on payment runs, weekends, and bank processing.",
) -> dict:
    next_release = get_next_payout_release(now, release_times=release_times, cutoff_times=cutoff_times)
    if not next_release["business_day"]:
        short_label = "Weekend payout: next business day"
    else:
        short_label = f"Next payout release: {next_release['label']}"

    return {
        "next_release": next_release,
        "short_label": short_label,
        "copy": f"{short_label}. {clearing_disclaimer}",
        "clearing_disclaimer": clearing_disclaimer,
    }
