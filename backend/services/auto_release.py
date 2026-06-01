"""
TrustTrade — two-track auto-release window.

The inspection window is counted from DISPATCH (when the seller marks the item sent)
and is a function of (delivery method, seller trust):

  * Verified seller (5+ completed trades, no upheld disputes) → delivery-method timer:
        digital 12h · in-person 24h · courier 5 days
  * New seller (< 5 trades, or any upheld dispute) → max(delivery timer, 5 days)
    i.e. a 5-day floor regardless of delivery method.

All helpers are pure and timezone-aware (UTC internally; SAST for display).
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

# Display timezone — South African Standard Time (UTC+2), matching email_service.
SAST = timezone(timedelta(hours=2))

# Inspection window per delivery method, in hours (the verified-seller / "fast" track).
DELIVERY_WINDOW_HOURS = {
    "digital": 12,
    "meet_in_person": 24,
    "in_person": 24,
    "collection": 24,
    "courier": 120,    # 5 days
    "postnet": 120,    # 5 days
}
DEFAULT_WINDOW_HOURS = 120          # unknown method → 5 days (most protective)
NEW_SELLER_FLOOR_HOURS = 120        # new sellers get at least 5 days

# A seller is "verified" for fast release with 5+ completed trades and no upheld disputes.
VERIFIED_MIN_TRADES = 5


def seller_qualifies_for_fast_release(seller_doc: Optional[Dict[str, Any]]) -> bool:
    """Verified (fast track) = 5+ completed trades and no upheld disputes.

    Prefer successful_trades (count of Released transactions — the truest 'completed'
    signal); fall back to total_trades. The safe failure mode is 'not verified' → the
    new-seller 5-day floor, i.e. MORE buyer protection when stats are missing/stale.
    """
    if not seller_doc:
        return False
    completed = seller_doc.get("successful_trades")
    if completed is None:
        completed = seller_doc.get("total_trades", 0) or 0
    disputes = seller_doc.get("valid_disputes_count", 0) or 0
    return completed >= VERIFIED_MIN_TRADES and disputes == 0


def delivery_base_hours(delivery_method: Optional[str]) -> int:
    return DELIVERY_WINDOW_HOURS.get((delivery_method or "").lower(), DEFAULT_WINDOW_HOURS)


def window_hours(delivery_method: Optional[str], seller_doc: Optional[Dict[str, Any]]) -> int:
    """Resolve the inspection-window length in hours for this delivery + seller."""
    base = delivery_base_hours(delivery_method)
    if seller_qualifies_for_fast_release(seller_doc):
        return base
    return max(base, NEW_SELLER_FLOOR_HOURS)


def compute_auto_release(
    delivery_method: Optional[str],
    seller_doc: Optional[Dict[str, Any]],
    from_time: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Return the auto-release timing for a just-dispatched transaction."""
    from_time = from_time or datetime.now(timezone.utc)
    hours = window_hours(delivery_method, seller_doc)
    auto_release_at = from_time + timedelta(hours=hours)
    verified = seller_qualifies_for_fast_release(seller_doc)
    return {
        "auto_release_at": auto_release_at,
        "auto_release_at_iso": auto_release_at.isoformat(),
        "window_hours": hours,
        "seller_track": "verified" if verified else "new",
        "delivery_method": (delivery_method or "").lower(),
        "dispatched_at_iso": from_time.isoformat(),
    }


def human_window(hours: int) -> str:
    """'5 days' / '24 hours' / '12 hours' — plain English for the window length."""
    if hours % 24 == 0:
        days = hours // 24
        return f"{days} day" if days == 1 else f"{days} days"
    return f"{hours} hour" if hours == 1 else f"{hours} hours"


def format_release_date(dt: datetime) -> str:
    """Friendly SAST date for SMS/email, e.g. 'Mon 9 Jun at 14:30'."""
    local = dt.astimezone(SAST)
    # %-d isn't portable on Windows; strip a leading zero manually.
    day = local.strftime("%a %d %b").replace(" 0", " ")
    return f"{day} at {local.strftime('%H:%M')}"


def confirm_link(frontend_url: str, token: str) -> str:
    return f"{frontend_url.rstrip('/')}/confirm/{token}"


def new_confirm_token() -> str:
    """Unguessable single-use token for the buyer's one-tap confirm link."""
    return secrets.token_urlsafe(24)
