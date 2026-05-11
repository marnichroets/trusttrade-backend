import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

ORG_TOKEN_ID = "32fbUbeMWjdor4uHBJdns"
DEFAULT_MONITORED_TOKENS = [
    ORG_TOKEN_ID,
    "32xbU6asjfrBnNHfeg57I",
    "32xFiEGGNCp46dyQtLuCH",
]

PDNG_STUCK_HOURS = 24
UNRESOLVED_ALERT_THRESHOLD = 5
RESIDUE_ALERT_THRESHOLD = 10.0
ORG_NEGATIVE_ALERT_THRESHOLD = -10.0
PAYOUT_DELAYED_HOURS = 24
PAYOUT_CRITICAL_HOURS = 48
PAYOUT_MONITOR_HOURS = 6
EXPECTED_SETTLEMENT_WINDOW = "up to 2 business days"
PAYOUT_TIMING_SHORT = "Payout processing · up to 2 business days"
PAYOUT_TIMING_COPY = (
    "Once funds are released from escrow, payouts are processed as quickly as possible. "
    "Bank settlement may take up to 2 business days depending on payment runs, weekends, and bank processing."
)
PROFITABILITY_PARSER_DEPLOYED_AT = datetime(2026, 5, 9, 12, 59, 59, tzinfo=timezone.utc)
DEFAULT_PLATFORM_FEE_PERCENT = 2.0
DEFAULT_MINIMUM_FEE = 5.0
PAYMENT_METHOD_COSTS = {
    "EFT": {"percent": 0.0, "fixed": 0.0},
    "CARD": {"percent": 2.5, "fixed": 0.0},
    "OZOW": {"percent": 2.5, "fixed": 0.0},
    "INSTANT_PAYOUT": {"percent": 0.0, "fixed": 0.0},
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).replace("Z", "+00:00")
    if " " in text and "T" not in text:
        text = text.replace(" ", "T")
    try:
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def business_hours_between(start: Optional[datetime], end: Optional[datetime] = None) -> Optional[float]:
    """Approximate business-hour age excluding Saturdays and Sundays."""
    if not start:
        return None
    end = end or datetime.now(timezone.utc)
    if start > end:
        return 0.0

    cursor = start
    total = 0.0
    while cursor < end:
        next_hour = min(cursor + timedelta(hours=1), end)
        if cursor.weekday() < 5:
            total += (next_hour - cursor).total_seconds() / 3600
        cursor = next_hour
    return round(total, 2)


def payout_sla_status(released_at, withdrawal_requested_at=None, settlement_confirmed_at=None) -> Dict[str, Any]:
    release_dt = parse_dt(released_at)
    withdrawal_dt = parse_dt(withdrawal_requested_at)
    settlement_dt = parse_dt(settlement_confirmed_at)
    now = datetime.now(timezone.utc)
    age_hours = round((now - release_dt).total_seconds() / 3600, 2) if release_dt else None
    business_age_hours = business_hours_between(release_dt, now) if release_dt else None

    if settlement_dt:
        status = "completed"
        monitor_level = "completed"
    elif business_age_hours is not None and business_age_hours >= PAYOUT_CRITICAL_HOURS:
        status = "critical"
        monitor_level = "critical"
    elif age_hours is not None and age_hours >= PAYOUT_DELAYED_HOURS:
        status = "delayed"
        monitor_level = "delayed"
    elif age_hours is not None and age_hours >= PAYOUT_MONITOR_HOURS:
        status = "on_track"
        monitor_level = "monitor"
    else:
        status = "on_track"
        monitor_level = "on_track"

    return {
        "released_at": release_dt.isoformat() if release_dt else None,
        "withdrawal_requested_at": withdrawal_dt.isoformat() if withdrawal_dt else None,
        "payout_processing_started_at": withdrawal_dt.isoformat() if withdrawal_dt else None,
        "expected_settlement_window": EXPECTED_SETTLEMENT_WINDOW,
        "payout_sla_status": status,
        "payout_sla_monitor_level": monitor_level,
        "payout_age_hours": age_hours,
        "payout_business_age_hours": business_age_hours,
    }


def money(value) -> Optional[float]:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def statement_category(entry: dict) -> str:
    reference = str(entry.get("reference") or "").lower()
    amount = money(entry.get("amount")) or 0
    entry_type = str(entry.get("type") or "").upper()

    if "payout from allocation:" in reference:
        return "seller_payout_credit"
    if "payout for allocation:" in reference:
        return "withdrawal_debit"
    if "requested funds to be withdrawn" in reference or "admin requested funds to be withdrawn" in reference:
        return "withdrawal_debit"
    if "fee for eft request" in reference or "fee for" in reference:
        return "tradesafe_fee"
    if "allocated funds to transaction:" in reference:
        return "allocation_debit"
    if "payout from transaction:" in reference or "payout for transaction:" in reference:
        return "agent_fee" if amount < 0 else "seller_payout_credit"
    if "refund" in reference:
        return "refund"
    if entry_type == "DEBIT" and amount < 0:
        return "agent_fee"
    return "unknown"


def normalize_statement_entry(entry: dict) -> dict:
    return {
        **entry,
        "amount_normalized": money(entry.get("amount")),
        "amount_unit": "ZAR",
        "category": statement_category(entry),
    }


def normalize_token_statement_entry(token_id: str, entry: dict) -> dict:
    row = normalize_statement_entry(entry)
    amount = money(row.get("amount_normalized")) or 0
    reference = str(row.get("reference") or "").lower()
    created = parse_dt(row.get("createdAt"))
    is_org_negative_payout = (
        token_id == ORG_TOKEN_ID
        and amount < 0
        and ("payout from transaction:" in reference or "payout for transaction:" in reference)
    )
    if is_org_negative_payout:
        row["category"] = "needs_fee_setup_review"
        row["accounting_note"] = (
            "Org token balance reflects TradeSafe statement accounting and may include historical fee movements."
        )
        row["post_parser_deploy"] = bool(created and created > PROFITABILITY_PARSER_DEPLOYED_AT)
    return row


def payout_amount(txn: dict) -> Tuple[Optional[float], Optional[str]]:
    for key in ("net_amount", "seller_receives"):
        value = money(txn.get(key))
        if value is not None:
            return value, key
    if txn.get("deal_type") == "DIGITAL_WORK":
        value = money(txn.get("amount"))
        if value is not None:
            return value, "amount"
    value = money(txn.get("item_price"))
    return (value, "item_price") if value is not None else (None, None)


def gross_amount(txn: dict) -> Optional[float]:
    for key in ("item_price", "amount", "total"):
        value = money(txn.get(key))
        if value is not None:
            return value
    return None


def trusttrade_fee(txn: dict, gross: Optional[float], fee_percent: float = DEFAULT_PLATFORM_FEE_PERCENT, minimum_fee: float = DEFAULT_MINIMUM_FEE) -> Tuple[float, str]:
    stored = money(txn.get("trusttrade_fee"))
    if stored is not None:
        return stored, "stored_trusttrade_fee"
    if gross is None:
        return 0.0, "unavailable"
    return max(round(gross * (fee_percent / 100), 2), minimum_fee), "estimated_fee_model"


def transaction_payment_method(txn: dict) -> str:
    method = (
        txn.get("payment_method")
        or txn.get("payment_type")
        or txn.get("tradesafe_payment_method")
        or txn.get("method")
        or "EFT"
    )
    return str(method).upper()


def payment_method_cost(amount: Optional[float], method: str) -> Tuple[float, str]:
    if amount is None:
        return 0.0, "unavailable"
    model = PAYMENT_METHOD_COSTS.get(str(method).upper(), PAYMENT_METHOD_COSTS["EFT"])
    cost = round(amount * (model["percent"] / 100) + model["fixed"], 2)
    return cost, "estimated_payment_method_cost" if cost else "no_cost_model_available"


def margin_percent(profit: float, gross: Optional[float]) -> Optional[float]:
    if not gross:
        return None
    return round((profit / gross) * 100, 2)


def break_even_fee_percent(amount: Optional[float], total_costs: float, minimum_fee: float = DEFAULT_MINIMUM_FEE) -> Optional[float]:
    if not amount or amount <= 0:
        return None
    if minimum_fee >= total_costs:
        return 0.0
    return round((total_costs / amount) * 100, 2)


async def get_all_statement_entries(token_id: str, first: int = 100) -> List[dict]:
    from tradesafe_service import get_token_statement

    entries: List[dict] = []
    page = 1
    while True:
        statement = await get_token_statement(token_id, first=first, page=page)
        entries.extend(normalize_token_statement_entry(token_id, entry) for entry in (statement.get("entries") or []))
        paginator = statement.get("paginator") or {}
        if not paginator.get("hasMorePages"):
            break
        page += 1
        if page > 20:
            logger.warning("[RECON] tokenStatement pagination stopped at page=%s token=%s", page, token_id)
            break
    return entries


def statement_summary(entries: List[dict]) -> Dict[str, Any]:
    statuses: Dict[str, int] = {}
    categories: Dict[str, int] = {}
    totals = {
        "seller_payout_credits": 0.0,
        "seller_withdrawals": 0.0,
        "tradesafe_fees": 0.0,
        "agent_fees": 0.0,
        "fee_setup_review": 0.0,
        "allocation_debits": 0.0,
    }
    for entry in entries:
        status = str(entry.get("status") or "UNKNOWN").upper()
        category = entry.get("category") or "unknown"
        amount = money(entry.get("amount_normalized")) or 0.0
        statuses[status] = statuses.get(status, 0) + 1
        categories[category] = categories.get(category, 0) + 1
        if category == "seller_payout_credit":
            totals["seller_payout_credits"] += amount
        elif category == "withdrawal_debit":
            totals["seller_withdrawals"] += amount
        elif category == "tradesafe_fee":
            totals["tradesafe_fees"] += amount
        elif category == "agent_fee":
            totals["agent_fees"] += amount
        elif category == "needs_fee_setup_review":
            totals["fee_setup_review"] += amount
        elif category == "allocation_debit":
            totals["allocation_debits"] += amount
    return {
        "statuses": statuses,
        "categories": categories,
        "totals": {key: round(value, 2) for key, value in totals.items()},
        "pdng_entries": [entry for entry in entries if str(entry.get("status") or "").upper() == "PDNG"],
        "acsp_entries": [entry for entry in entries if str(entry.get("status") or "").upper() == "ACSP"],
        "negative_entries": [entry for entry in entries if (money(entry.get("amount_normalized")) or 0) < 0],
    }


def match_transaction_statement(txn: dict, entries: List[dict]) -> Dict[str, Any]:
    tradesafe_id = txn.get("tradesafe_id") or txn.get("tradesafe_transaction_id") or txn.get("tradesafe_token_id")
    allocation_id = txn.get("tradesafe_allocation_id")
    expected_amount, amount_source = payout_amount(txn)
    reference_terms = [
        str(ref).lower()
        for ref in (txn.get("transaction_id"), txn.get("deal_id"), txn.get("share_code"), tradesafe_id, allocation_id)
        if ref
    ]

    matched = []
    for entry in entries:
        reference = str(entry.get("reference") or "").lower()
        reference_match = any(term in reference for term in reference_terms)
        amount_match = False
        amount = money(entry.get("amount_normalized"))
        if expected_amount is not None and amount is not None:
            amount_match = abs(abs(amount) - abs(expected_amount)) <= 1.00
        if reference_match or (amount_match and entry.get("category") in {"seller_payout_credit", "withdrawal_debit"}):
            matched.append(entry)

    credit_rows = [entry for entry in matched if entry.get("category") == "seller_payout_credit"]
    withdrawal_rows = [entry for entry in matched if entry.get("category") == "withdrawal_debit"]
    fee_rows = [entry for entry in matched if entry.get("category") in {"tradesafe_fee", "agent_fee"}]
    allocation_rows = [entry for entry in matched if entry.get("category") == "allocation_debit"]
    amount_mismatch = False
    if expected_amount is not None and credit_rows:
        amount_mismatch = all(abs(abs(money(row.get("amount_normalized")) or 0) - expected_amount) > 1.00 for row in credit_rows)

    final_state = "missing_statement_entry"
    detected_issue = "missing_statement_entry"
    if withdrawal_rows and any(str(row.get("status") or "").upper() == "PDNG" for row in withdrawal_rows):
        final_state = "pending_bank_settlement"
        detected_issue = "pdng_withdrawal_pending"
    elif withdrawal_rows and all(str(row.get("status") or "").upper() == "ACSP" for row in withdrawal_rows):
        final_state = "reconciled"
        detected_issue = None
    elif credit_rows and not withdrawal_rows:
        final_state = "token_residue"
        detected_issue = "seller_credit_without_withdrawal"
    elif allocation_rows and not withdrawal_rows:
        final_state = "needs_tradesafe_support"
        detected_issue = "allocation_without_withdrawal_statement"
    if amount_mismatch:
        final_state = "needs_tradesafe_support"
        detected_issue = "mismatched_payout_amount"

    release_dt = parse_dt(txn.get("funds_released_at") or txn.get("released_at") or txn.get("completed_at"))
    withdrawal_dt = parse_dt(txn.get("withdrawal_requested_at") or txn.get("withdrawal_started_at") or txn.get("withdrawal_triggered_at"))
    settlement_dt = None
    for row in withdrawal_rows:
        if str(row.get("status") or "").upper() == "ACSP":
            settlement_dt = parse_dt(row.get("updatedAt") or row.get("createdAt"))
            break

    payout_duration_hours = None
    if release_dt and settlement_dt:
        payout_duration_hours = round((settlement_dt - release_dt).total_seconds() / 3600, 2)

    sla = payout_sla_status(
        release_dt.isoformat() if release_dt else None,
        withdrawal_dt.isoformat() if withdrawal_dt else None,
        settlement_dt.isoformat() if settlement_dt else None,
    )
    if final_state == "reconciled" and not sla["released_at"]:
        sla["payout_sla_status"] = "completed"
        sla["payout_sla_monitor_level"] = "completed"

    settlement_status = txn.get("settlement_status")
    if withdrawal_rows:
        if any(str(row.get("status") or "").upper() == "ACSP" for row in withdrawal_rows):
            settlement_status = "settlement_confirmed"
        elif any(str(row.get("status") or "").upper() == "PDNG" for row in withdrawal_rows):
            settlement_status = "settlement_unknown"
    elif final_state in {"needs_tradesafe_support", "missing_statement_entry"}:
        settlement_status = "awaiting_tradesafe_support"

    return {
        "transaction_id": txn.get("transaction_id"),
        "deal_id": txn.get("deal_id"),
        "share_code": txn.get("share_code"),
        "seller_email": txn.get("seller_email") or txn.get("freelancer_email"),
        "token_id": txn.get("tradesafe_seller_token_id"),
        "tradesafe_transaction_id": tradesafe_id,
        "allocation_id": allocation_id,
        "expected_seller_amount": expected_amount,
        "expected_amount_source": amount_source,
        "statement_refs": [row.get("reference") for row in matched if row.get("reference")],
        "statement_rows": matched,
        "credit_rows": credit_rows,
        "withdrawal_rows": withdrawal_rows,
        "fee_rows": fee_rows,
        "allocation_rows": allocation_rows,
        "reconciliation_state": final_state,
        "detected_issue": detected_issue,
        "payout_status": txn.get("payout_status"),
        "withdrawal_status": txn.get("withdrawal_status"),
        "settlement_status": settlement_status,
        "funds_released_at": txn.get("funds_released_at") or txn.get("released_at") or txn.get("completed_at"),
        "released_at": sla["released_at"],
        "withdrawal_requested_at": sla["withdrawal_requested_at"],
        "payout_processing_started_at": sla["payout_processing_started_at"],
        "expected_settlement_window": sla["expected_settlement_window"],
        "settlement_confirmed_at": settlement_dt.isoformat() if settlement_dt else None,
        "payout_duration_hours": payout_duration_hours,
        "payout_sla_status": sla["payout_sla_status"],
        "payout_sla_monitor_level": sla["payout_sla_monitor_level"],
        "age_hours": sla["payout_age_hours"],
        "business_age_hours": sla["payout_business_age_hours"],
        "requires_manual_review": final_state != "reconciled",
    }


BANK_SETTLEMENT_PENDING_MESSAGE = "Payout processed by TradeSafe, bank settlement pending"
NO_RETRY_PROCESSED_NOTE = "Do not retry if TradeSafe already shows processed payout entry."
PROCESSED_STATEMENT_STATUSES = {"ACSP", "PROCESSED", "PROCESSED_BY_TRADESAFE", "SUCCESS", "SUCCEEDED", "COMPLETED"}


def has_bank_settlement_confirmation(txn: dict) -> bool:
    """Local bank settlement evidence only; TradeSafe processed rows are not bank confirmation."""
    if txn.get("settlement_confirmed_at") or txn.get("bank_confirmed_at"):
        return True
    if txn.get("bank_reference") or txn.get("settlement_reference"):
        return True
    if txn.get("settlement_status") == "settlement_confirmed":
        return True
    return False


def tradesafe_processed_rows(rows: List[dict]) -> List[dict]:
    return [
        row for row in rows or []
        if row.get("category") == "withdrawal_debit"
        and str(row.get("status") or "").upper() in PROCESSED_STATEMENT_STATUSES
    ]


def statement_row_time(row: dict) -> Optional[datetime]:
    return parse_dt(row.get("processedAt") or row.get("updatedAt") or row.get("createdAt"))


def settlement_monitor_status(age_business_hours: Optional[float]) -> str:
    if age_business_hours is not None and age_business_hours >= PAYOUT_CRITICAL_HOURS:
        return "critical"
    if age_business_hours is not None and age_business_hours >= PAYOUT_DELAYED_HOURS:
        return "delayed"
    return "on_track"


def pending_bank_settlement_action(row: dict) -> str:
    if row.get("tradesafe_processed"):
        return f"{NO_RETRY_PROCESSED_NOTE} Verify bank settlement evidence and wait for TradeSafe support guidance."
    if row.get("payout_processing_started"):
        return "Monitor TradeSafe processing evidence. Do not retry or trigger withdrawal from this report."
    return "Verify release and TradeSafe statement evidence. Do not mutate payout state from this report."


def pending_bank_settlement_report_row(match: dict, txn: dict) -> Dict[str, Any]:
    withdrawal_rows = match.get("withdrawal_rows") or []
    processed_rows = tradesafe_processed_rows(withdrawal_rows)
    processed_times = [statement_row_time(row) for row in processed_rows]
    processed_times = [value for value in processed_times if value]
    processed_at = min(processed_times).isoformat() if processed_times else None
    local_processing_started = (
        txn.get("payout_processing_started_at")
        or txn.get("withdrawal_requested_at")
        or txn.get("withdrawal_started_at")
        or txn.get("withdrawal_triggered_at")
        or match.get("payout_processing_started_at")
    )
    processing_started_at = processed_at or local_processing_started
    released_at = match.get("released_at") or txn.get("funds_released_at") or txn.get("released_at") or txn.get("completed_at")
    age_start = parse_dt(processed_at or processing_started_at or released_at)
    business_age_hours = business_hours_between(age_start) if age_start else None
    bank_confirmed = has_bank_settlement_confirmation(txn)
    tradesafe_processed = bool(processed_rows)
    bank_settlement_pending = tradesafe_processed and not bank_confirmed
    status = settlement_monitor_status(business_age_hours)
    row = {
        "transaction_id": txn.get("transaction_id") or txn.get("deal_id") or match.get("transaction_id") or match.get("deal_id"),
        "deal_id": txn.get("deal_id") or match.get("deal_id"),
        "tradesafe_transaction_id": match.get("tradesafe_transaction_id") or txn.get("tradesafe_id") or txn.get("tradesafe_transaction_id"),
        "seller_token": match.get("token_id") or txn.get("tradesafe_seller_token_id"),
        "seller_email": txn.get("seller_email") or txn.get("freelancer_email") or match.get("seller_email"),
        "amount": match.get("expected_seller_amount"),
        "released_at": released_at,
        "payout_processing_started": bool(processing_started_at or withdrawal_rows),
        "payout_processing_started_at": parse_dt(processing_started_at).isoformat() if parse_dt(processing_started_at) else None,
        "tradesafe_processed": tradesafe_processed,
        "processed_at": processed_at,
        "tradesafe_processed_rows": processed_rows,
        "bank_settlement_confirmed": bank_confirmed,
        "bank_settlement_not_confirmed": not bank_confirmed,
        "bank_settlement_pending": bank_settlement_pending,
        "status": status,
        "age_business_hours": business_age_hours,
        "age": None if business_age_hours is None else f"{business_age_hours} business hours",
        "recommended_action": None,
        "internal_note": NO_RETRY_PROCESSED_NOTE if tradesafe_processed else "No payout retries, withdrawals, or payout mutations from this monitor.",
    }
    row["recommended_action"] = pending_bank_settlement_action(row)
    return row


async def get_payout_settlement_monitor(db, limit: int = 250) -> Dict[str, Any]:
    """
    Read-only monitor for released payouts and bank settlement evidence.
    It fetches TradeSafe token statements but does not retry, withdraw, or mutate payout records.
    """
    query = {
        "$or": [
            {"tradesafe_state": {"$in": ["FUNDS_RELEASED", "COMPLETE", "COMPLETED"]}},
            {"release_status": "Released"},
            {"status": "COMPLETE", "deal_type": "DIGITAL_WORK"},
            {"funds_released_at": {"$exists": True, "$ne": None}},
            {"released_at": {"$exists": True, "$ne": None}},
        ],
    }
    projection = {"_id": 0}
    txns = await db.transactions.find(query, projection).sort("created_at", -1).limit(max(1, min(limit, 1000))).to_list(max(1, min(limit, 1000)))
    token_ids = sorted({txn.get("tradesafe_seller_token_id") for txn in txns if txn.get("tradesafe_seller_token_id")})
    token_entries: Dict[str, List[dict]] = {}
    for token_id in token_ids:
        try:
            token_entries[token_id] = await get_all_statement_entries(token_id)
        except Exception as exc:
            logger.error("[PAYOUT_SETTLEMENT_MONITOR] token statement fetch failed token=%s error=%s", token_id, exc)
            token_entries[token_id] = []

    rows = []
    for txn in txns:
        match = match_transaction_statement(txn, token_entries.get(txn.get("tradesafe_seller_token_id"), []))
        rows.append(pending_bank_settlement_report_row(match, txn))

    pending_rows = [row for row in rows if row["bank_settlement_pending"]]
    delayed_rows = [row for row in rows if row["status"] == "delayed"]
    critical_rows = [row for row in rows if row["status"] == "critical"]
    return {
        "source_of_truth": "TradeSafe tokenStatement plus local bank settlement evidence",
        "read_only": True,
        "internal_note": NO_RETRY_PROCESSED_NOTE,
        "alert_message": BANK_SETTLEMENT_PENDING_MESSAGE,
        "summary": {
            "released_payouts": len(rows),
            "payout_processing_started": sum(1 for row in rows if row["payout_processing_started"]),
            "tradesafe_processed_rows": sum(len(row["tradesafe_processed_rows"]) for row in rows),
            "bank_settlement_not_confirmed": sum(1 for row in rows if row["bank_settlement_not_confirmed"]),
            "bank_settlement_pending": len(pending_rows),
            "on_track": sum(1 for row in rows if row["status"] == "on_track"),
            "delayed": len(delayed_rows),
            "critical": len(critical_rows),
        },
        "rows": rows,
        "pending_bank_settlement_rows": pending_rows,
    }


def calculate_transaction_profitability(txn: dict, match: dict) -> Dict[str, Any]:
    gross = gross_amount(txn)
    tt_fee, tt_fee_source = trusttrade_fee(txn, gross)
    ts_fee_rows = match.get("fee_rows") or []
    matched_tradesafe_fees = round(sum(abs(money(row.get("amount_normalized")) or 0) for row in ts_fee_rows if row.get("category") == "tradesafe_fee"), 2)
    agent_adjustments = round(sum(money(row.get("amount_normalized")) or 0 for row in ts_fee_rows if row.get("category") == "agent_fee"), 2)

    withdrawal_rows = match.get("withdrawal_rows") or []
    payout_costs = 0.0
    withdrawal_fee_rows = [
        row for row in ts_fee_rows
        if "eft request" in str(row.get("reference") or "").lower()
    ]
    withdrawal_fees = round(sum(abs(money(row.get("amount_normalized")) or 0) for row in withdrawal_fee_rows), 2)

    method = transaction_payment_method(txn)
    payment_cost, payment_cost_source = payment_method_cost(gross, method)
    dispute_costs = money(txn.get("dispute_cost")) or money(txn.get("admin_dispute_cost")) or 0.0
    tradesafe_costs = round(matched_tradesafe_fees + withdrawal_fees + payment_cost, 2)
    net_profit = round(tt_fee - tradesafe_costs - payout_costs - dispute_costs + agent_adjustments, 2)
    margin = margin_percent(net_profit, gross)
    profitable = net_profit >= 0
    total_costs = round(tradesafe_costs + payout_costs + dispute_costs - agent_adjustments, 2)

    return {
        "transaction_id": txn.get("transaction_id"),
        "deal_id": txn.get("deal_id"),
        "share_code": txn.get("share_code"),
        "seller_email": txn.get("seller_email") or txn.get("freelancer_email"),
        "payment_method": method,
        "created_at": txn.get("created_at") or txn.get("completed_at") or txn.get("funds_released_at"),
        "gross_transaction_amount": gross,
        "trusttrade_fee_earned": tt_fee,
        "trusttrade_fee_source": tt_fee_source,
        "tradesafe_fees": matched_tradesafe_fees,
        "withdrawal_fees": withdrawal_fees,
        "payment_method_fees": payment_cost,
        "payment_method_fee_source": payment_cost_source,
        "payout_costs": payout_costs,
        "dispute_costs": dispute_costs,
        "negative_adjustments": agent_adjustments if agent_adjustments < 0 else 0.0,
        "unresolved_fee_entries": [row for row in ts_fee_rows if str(row.get("status") or "").upper() != "ACSP"],
        "total_costs": total_costs,
        "net_platform_profit": net_profit,
        "profit_margin_percent": margin,
        "profitable": profitable,
        "recommendation": "fee too low" if not profitable else "profitable",
        "break_even_fee_percent": break_even_fee_percent(gross, total_costs),
        "reconciliation_state": match.get("reconciliation_state"),
        "statement_refs": match.get("statement_refs", []),
    }


def simulate_fee_model(
    rows: List[dict],
    percent: float,
    minimum_fee: float = 0.0,
    label: Optional[str] = None,
    buyer_fee_share: float = 0.0,
    seller_fee_share: float = 1.0,
) -> Dict[str, Any]:
    simulated = []
    for row in rows:
        gross = row.get("gross_transaction_amount")
        if not gross:
            continue
        total_fee = max(round(gross * (percent / 100), 2), minimum_fee)
        revenue = total_fee
        costs = row.get("total_costs") or 0
        profit = round(revenue - costs, 2)
        simulated.append({
            "transaction_id": row.get("transaction_id") or row.get("deal_id"),
            "gross_transaction_amount": gross,
            "buyer_fee": round(total_fee * buyer_fee_share, 2),
            "seller_fee": round(total_fee * seller_fee_share, 2),
            "simulated_revenue": revenue,
            "simulated_profit": profit,
            "simulated_margin_percent": margin_percent(profit, gross),
            "profitable": profit >= 0,
        })
    total_gross = round(sum(row["gross_transaction_amount"] for row in simulated), 2)
    total_revenue = round(sum(row["simulated_revenue"] for row in simulated), 2)
    total_profit = round(sum(row["simulated_profit"] for row in simulated), 2)
    monthly_multiplier = 30.0
    loss_count = sum(1 for row in simulated if not row["profitable"])
    margin = margin_percent(total_profit, total_gross)
    return {
        "label": label or f"{percent}% min R{minimum_fee:.2f}",
        "percent": percent,
        "minimum_fee": minimum_fee,
        "buyer_fee_share": buyer_fee_share,
        "seller_fee_share": seller_fee_share,
        "projected_revenue": total_revenue,
        "projected_profit": total_profit,
        "projected_margin_percent": margin,
        "estimated_monthly_profit": round(total_profit * monthly_multiplier, 2),
        "estimated_margin": margin,
        "estimated_payout_costs": round(sum(row.get("total_costs") or 0 for row in rows) * monthly_multiplier, 2),
        "estimated_loss_rate": round((loss_count / len(simulated)) * 100, 2) if simulated else 0.0,
        "pricing_warning": "pricing model risky" if margin is not None and margin < 10 else None,
        "profitable_transaction_count": sum(1 for row in simulated if row["profitable"]),
        "loss_making_transaction_count": loss_count,
    }


def profitability_segments(rows: List[dict]) -> List[Dict[str, Any]]:
    segments = [
        ("R0-R500", 0, 500),
        ("R500-R2000", 500, 2000),
        ("R2000-R10000", 2000, 10000),
        ("R10000+", 10000, float("inf")),
    ]
    results = []
    for label, low, high in segments:
        scoped = [
            row for row in rows
            if (row.get("gross_transaction_amount") or 0) >= low and (row.get("gross_transaction_amount") or 0) < high
        ]
        gross = round(sum(row.get("gross_transaction_amount") or 0 for row in scoped), 2)
        profit = round(sum(row.get("net_platform_profit") or 0 for row in scoped), 2)
        loss_count = sum(1 for row in scoped if not row.get("profitable"))
        results.append({
            "segment": label,
            "transaction_count": len(scoped),
            "gross_transaction_amount": gross,
            "net_profit": profit,
            "margin_percent": margin_percent(profit, gross),
            "loss_making_count": loss_count,
            "loss_making": loss_count > 0 or profit < 0,
        })
    return results


def recommendation_engine(rows: List[dict], simulations: List[dict], segments: List[dict]) -> Dict[str, Any]:
    viable = [
        model for model in simulations
        if (model.get("projected_profit") or 0) >= 0 and (model.get("projected_margin_percent") or 0) >= 10
    ]
    recommended = sorted(viable, key=lambda model: (model["percent"], model["minimum_fee"]))[0] if viable else None
    loss_segments = [segment["segment"] for segment in segments if segment["loss_making"]]
    methods = {}
    for row in rows:
        method = row.get("payment_method") or "UNKNOWN"
        methods.setdefault(method, {"count": 0, "profit": 0.0})
        methods[method]["count"] += 1
        methods[method]["profit"] += row.get("net_platform_profit") or 0
    surcharge_methods = [
        method for method, data in methods.items()
        if data["count"] > 0 and data["profit"] < 0 and method in {"CARD", "OZOW"}
    ]
    return {
        "recommended_minimum_fee": (recommended or {}).get("minimum_fee") or 20.0,
        "recommended_fee_percent": (recommended or {}).get("percent") or 3.0,
        "recommended_model": (recommended or {}).get("label") or "3% min R20",
        "surcharge_payment_methods": surcharge_methods,
        "loss_making_segments": loss_segments,
        "operational_recommendations": [
            "small EFT transactions currently unprofitable" if "R0-R500" in loss_segments else "small EFT segment needs continued monitoring",
            "instant payout costs exceed margin" if any((row.get("withdrawal_fees") or 0) > (row.get("trusttrade_fee_earned") or 0) for row in rows) else "instant payout costs not fully proven from ledger yet",
            "minimum fee required" if loss_segments else "minimum fee still recommended for operational buffer",
            "apply surcharge to card/Ozow if payment-method costs are not passed through" if surcharge_methods else "keep payment method surcharge logic available",
        ],
    }


def pricing_analysis(rows: List[dict]) -> Dict[str, Any]:
    by_method = {}
    for method, model in PAYMENT_METHOD_COSTS.items():
        sample_costs = []
        for size in (100, 250, 500, 1000, 5000, 10000):
            payment_cost = round(size * (model["percent"] / 100) + model["fixed"], 2)
            instant_cost = PAYMENT_METHOD_COSTS["INSTANT_PAYOUT"]["fixed"]
            total_cost = payment_cost + instant_cost
            sample_costs.append({
                "transaction_size": size,
                "break_even_fee_percent": break_even_fee_percent(size, total_cost),
                "estimated_cost": total_cost,
            })
        by_method[method.lower()] = sample_costs

    observed_break_even = [
        row.get("break_even_fee_percent")
        for row in rows
        if row.get("break_even_fee_percent") is not None
    ]
    return {
        "by_payment_method": by_method,
        "observed_average_break_even_percent": round(sum(observed_break_even) / len(observed_break_even), 2) if observed_break_even else None,
    }


async def get_profitability_analysis(db, limit: int = 500) -> Dict[str, Any]:
    latest = await run_reconciliation(db, mode="recent", limit=limit)
    match_by_id = {
        match.get("transaction_id") or match.get("deal_id"): match
        for match in latest.get("matches", [])
    }
    ids = [item for item in match_by_id.keys() if item]
    txns = await db.transactions.find(
        {"$or": [{"transaction_id": {"$in": ids}}, {"deal_id": {"$in": ids}}]},
        {"_id": 0},
    ).to_list(len(ids) or 1)

    rows = []
    for txn in txns:
        key = txn.get("transaction_id") or txn.get("deal_id")
        match = match_by_id.get(key) or {}
        rows.append(calculate_transaction_profitability(txn, match))

    total_gross = round(sum(row.get("gross_transaction_amount") or 0 for row in rows), 2)
    total_revenue = round(sum(row.get("trusttrade_fee_earned") or 0 for row in rows), 2)
    total_tradesafe_costs = round(sum((row.get("tradesafe_fees") or 0) + (row.get("withdrawal_fees") or 0) + (row.get("payment_method_fees") or 0) for row in rows), 2)
    total_net_profit = round(sum(row.get("net_platform_profit") or 0 for row in rows), 2)
    profitable_count = sum(1 for row in rows if row.get("profitable"))
    loss_count = sum(1 for row in rows if not row.get("profitable"))
    org_token_entries = [
        entry
        for token in latest.get("tokens", [])
        if token.get("token_id") == ORG_TOKEN_ID
        for entry in token.get("entries", [])
    ]
    fee_review_entries = [entry for entry in org_token_entries if entry.get("category") == "needs_fee_setup_review"]
    org_breakdown = {
        "trusttrade_earned_revenue": total_revenue,
        "tradesafe_fees": total_tradesafe_costs,
        "negative_adjustments": 0.0,
        "fee_setup_review_entries": fee_review_entries,
        "historical_fee_movements_needing_review": round(sum(money(entry.get("amount_normalized")) or 0 for entry in fee_review_entries), 2),
        "unresolved_fee_entries": [entry for entry in org_token_entries if str(entry.get("status") or "").upper() != "ACSP"],
    }

    simulations = [
        simulate_fee_model(rows, 2.0, label="2%"),
        simulate_fee_model(rows, 2.5, label="2.5%"),
        simulate_fee_model(rows, 3.0, label="3%"),
        simulate_fee_model(rows, 2.5, minimum_fee=15.0, label="2.5% min R15"),
        simulate_fee_model(rows, 3.0, minimum_fee=20.0, label="3% min R20"),
        simulate_fee_model(rows, 2.5, minimum_fee=15.0, label="buyer pays fee", buyer_fee_share=1.0, seller_fee_share=0.0),
        simulate_fee_model(rows, 2.5, minimum_fee=15.0, label="split buyer/seller fee", buyer_fee_share=0.5, seller_fee_share=0.5),
    ]
    segments = profitability_segments(rows)
    engine = recommendation_engine(rows, simulations, segments)

    return {
        "basis": "statement-backed where available; payment-method fees are estimated when no ledger evidence exists",
        "transaction_count": len(rows),
        "total_gross_transaction_amount": total_gross,
        "total_revenue": total_revenue,
        "total_tradesafe_costs": total_tradesafe_costs,
        "total_net_profit": total_net_profit,
        "average_profit_per_transaction": round(total_net_profit / len(rows), 2) if rows else 0.0,
        "profit_margin_percent": margin_percent(total_net_profit, total_gross),
        "profitable_transaction_count": profitable_count,
        "loss_making_transaction_count": loss_count,
        "transactions": rows,
        "fee_simulations": simulations,
        "fee_strategy_presets": simulations,
        "transaction_segments": segments,
        "recommendation_engine": engine,
        "pricing_analysis": pricing_analysis(rows),
        "org_token_accounting_breakdown": org_breakdown,
        "recommendations": build_profitability_recommendations(rows, simulations) + engine["operational_recommendations"],
    }


def build_profitability_recommendations(rows: List[dict], simulations: List[dict]) -> List[str]:
    recommendations = []
    loss_rows = [row for row in rows if not row.get("profitable")]
    if loss_rows:
        largest_loss_size = min(loss_rows, key=lambda row: row.get("gross_transaction_amount") or 0).get("gross_transaction_amount")
        recommendations.append(f"Transactions around R{largest_loss_size:.2f} or below are currently most exposed to fee-too-low losses.")
    profitable_models = [model for model in simulations if (model.get("projected_profit") or 0) >= 0]
    if profitable_models:
        best = sorted(profitable_models, key=lambda model: (model["percent"], model["minimum_fee"]))[0]
        recommendations.append(f"Lowest simulated profitable model: {best['percent']}% with R{best['minimum_fee']:.2f} minimum fee.")
    else:
        recommendations.append("No simulated percentage model reached profitability with the observed cost base; TradeSafe cost review is required.")
    recommendations.append("Keep TradeSafe support review open for negative org-token fee entries before treating platform revenue as settled cash.")
    return recommendations


async def create_finance_alert(db, alert_type: str, severity: str, message: str, details: Optional[dict] = None) -> None:
    key = f"{alert_type}:{message[:120]}"
    recent_cutoff = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
    existing = await db.finance_alerts.find_one({
        "dedupe_key": key,
        "resolved": {"$ne": True},
        "created_at": {"$gte": recent_cutoff},
    })
    if existing:
        return
    doc = {
        "alert_id": f"fin_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
        "dedupe_key": key,
        "alert_type": alert_type,
        "severity": severity,
        "message": message,
        "details": details or {},
        "created_at": now_iso(),
        "resolved": False,
    }
    await db.finance_alerts.insert_one(doc)
    await db.alerts.insert_one({
        "alert_id": doc["alert_id"],
        "type": f"finance_{alert_type}",
        "priority": severity.upper(),
        "message": message,
        "details": details or {},
        "timestamp": doc["created_at"],
        "resolved": False,
        "source": "finance_reconciliation",
    })


async def write_audit_record(db, action: str, actor: str, transaction_id: Optional[str] = None, details: Optional[dict] = None) -> None:
    await db.finance_audit_trail.insert_one({
        "action": action,
        "actor": actor,
        "transaction_id": transaction_id,
        "details": details or {},
        "created_at": now_iso(),
        "immutable": True,
    })


def health_score(metrics: dict) -> int:
    score = 100
    score -= min(35, int(metrics.get("unresolved_count", 0)) * 4)
    score -= min(20, int(metrics.get("pdng_over_24h", 0)) * 10)
    score -= min(20, int(metrics.get("failed_withdrawals", 0)) * 8)
    if metrics.get("new_negative_org_movements", 0) > 0:
        score -= min(15, int(metrics["new_negative_org_movements"]) * 5)
    score -= min(10, int(metrics.get("missing_statement_entry_count", 0)) * 2)
    return max(0, min(100, score))


async def run_reconciliation(db, mode: str = "recent", limit: int = 150) -> Dict[str, Any]:
    from tradesafe_service import get_token_details

    started_at = now_iso()
    cutoff = datetime.now(timezone.utc) - (timedelta(days=7) if mode == "recent" else timedelta(days=90))
    cutoff_iso = cutoff.isoformat()
    query = {
        "$or": [
            {"tradesafe_seller_token_id": {"$exists": True, "$ne": None}},
            {"tradesafe_id": {"$exists": True, "$ne": None}},
            {"tradesafe_transaction_id": {"$exists": True, "$ne": None}},
        ],
        "created_at": {"$gte": cutoff_iso},
    }
    projection = {"_id": 0}
    txns = await db.transactions.find(query, projection).sort("created_at", -1).limit(limit).to_list(limit)

    token_ids = sorted({txn.get("tradesafe_seller_token_id") for txn in txns if txn.get("tradesafe_seller_token_id")} | set(DEFAULT_MONITORED_TOKENS))
    token_entries: Dict[str, List[dict]] = {}
    token_details: Dict[str, dict] = {}
    for token_id in token_ids:
        try:
            token_details[token_id] = await get_token_details(token_id) or {}
            token_entries[token_id] = await get_all_statement_entries(token_id)
        except Exception as exc:
            logger.error("[RECON] token fetch failed token=%s error=%s", token_id, exc)
            token_entries[token_id] = []
            token_details[token_id] = {}

    matches = [match_transaction_statement(txn, token_entries.get(txn.get("tradesafe_seller_token_id"), [])) for txn in txns]
    now = datetime.now(timezone.utc)
    logs = []
    for match in matches:
        state = match["reconciliation_state"]
        issue = match.get("detected_issue")
        log_doc = {
            "transaction_id": match.get("transaction_id") or match.get("deal_id"),
            "deal_id": match.get("deal_id"),
            "token_id": match.get("token_id"),
            "reconciliation_state": state,
            "detected_issue": issue,
            "statement_refs": match.get("statement_refs", []),
            "payout_status": match.get("payout_status"),
            "withdrawal_status": match.get("withdrawal_status"),
            "settlement_status": match.get("settlement_status"),
            "payout_sla_status": match.get("payout_sla_status"),
            "age_hours": match.get("age_hours"),
            "payout_duration_hours": match.get("payout_duration_hours"),
            "created_at": now.isoformat(),
            "resolved_at": now.isoformat() if state == "reconciled" else None,
            "auto_resolved": state == "reconciled",
            "requires_manual_review": match.get("requires_manual_review", True),
        }
        logs.append(log_doc)

    if logs:
        await db.finance_reconciliation_logs.insert_many(logs)

    all_entries = [entry for entries in token_entries.values() for entry in entries]
    summary = statement_summary(all_entries)
    unresolved = [match for match in matches if match["reconciliation_state"] != "reconciled"]
    pdng_old = []
    for entry in summary["pdng_entries"]:
        created = parse_dt(entry.get("createdAt"))
        if created and now - created > timedelta(hours=PDNG_STUCK_HOURS):
            pdng_old.append(entry)

    org_balance = money(token_details.get(ORG_TOKEN_ID, {}).get("balance")) or 0
    org_entries = token_entries.get(ORG_TOKEN_ID, [])
    negative_org_review_entries = [
        entry for entry in org_entries
        if entry.get("category") == "needs_fee_setup_review"
    ]
    new_negative_org_entries = [
        entry for entry in negative_org_review_entries
        if entry.get("post_parser_deploy")
    ]
    org_movement_dates = [parse_dt(entry.get("createdAt")) for entry in org_entries if parse_dt(entry.get("createdAt"))]
    last_org_movement = max(org_movement_dates).isoformat() if org_movement_dates else None
    residues = []
    negative_balances = []
    for token_id, token in token_details.items():
        balance = money(token.get("balance")) or 0
        if balance > RESIDUE_ALERT_THRESHOLD:
            residues.append({"token_id": token_id, "balance": balance})
        if balance < 0:
            negative_balances.append({"token_id": token_id, "balance": balance})

    failed_withdrawals = await db.transactions.count_documents({"withdrawal_status": "failed"})
    settlement_monitor_rows = [
        pending_bank_settlement_report_row(match, txn)
        for txn, match in zip(txns, matches)
    ]
    bank_settlement_pending_rows = [
        row for row in settlement_monitor_rows
        if row.get("bank_settlement_pending")
    ]
    payout_monitor = [match for match in matches if match.get("payout_sla_monitor_level") == "monitor"]
    payout_delayed = [match for match in matches if match.get("payout_sla_status") == "delayed"]
    payout_critical = [match for match in matches if match.get("payout_sla_status") == "critical"]
    payouts_processing_today = [
        match for match in matches
        if match.get("payout_sla_status") == "on_track"
        and match.get("released_at")
        and parse_dt(match.get("released_at"))
        and parse_dt(match.get("released_at")).date() == now.date()
    ]
    payouts_expected_next_business_day = [
        match for match in matches
        if match.get("payout_sla_status") in {"on_track", "delayed"}
        and 6 <= float(match.get("age_hours") or 0) < 24
    ]
    metrics = {
        "unresolved_count": len(unresolved),
        "pdng_count": len(summary["pdng_entries"]),
        "acsp_count": len(summary["acsp_entries"]),
        "pdng_over_24h": len(pdng_old),
        "payout_monitor_count": len(payout_monitor),
        "payout_delayed_count": len(payout_delayed),
        "payout_critical_count": len(payout_critical),
        "payouts_processing_today": len(payouts_processing_today),
        "payouts_expected_next_business_day": len(payouts_expected_next_business_day),
        "payouts_approaching_2_business_days": len(payout_delayed),
        "critical_delayed_payouts": len(payout_critical),
        "bank_settlement_pending_count": len(bank_settlement_pending_rows),
        "payout_processed_bank_settlement_pending_count": len(bank_settlement_pending_rows),
        "expected_settlement_window": EXPECTED_SETTLEMENT_WINDOW,
        "payout_timing_short": PAYOUT_TIMING_SHORT,
        "failed_withdrawals": failed_withdrawals,
        "missing_statement_entry_count": sum(1 for match in matches if match["reconciliation_state"] == "missing_statement_entry"),
        "org_token_balance": org_balance,
        "total_fees": summary["totals"]["agent_fees"],
        "fee_setup_review_total": summary["totals"].get("fee_setup_review", 0.0),
        "new_negative_org_movements": len(new_negative_org_entries),
        "last_new_org_token_movement_timestamp": last_org_movement,
        "tradesafe_fees": summary["totals"]["tradesafe_fees"],
        "unresolved_value": round(sum(match.get("expected_seller_amount") or 0 for match in unresolved), 2),
    }
    metrics["reconciliation_health_score"] = health_score(metrics)
    durations = [match["payout_duration_hours"] for match in matches if match.get("payout_duration_hours") is not None]
    metrics["avg_payout_time"] = round(sum(durations) / len(durations), 2) if durations else None
    metrics["payout_success_rate"] = round((len(matches) - len(unresolved)) / len(matches) * 100, 2) if matches else 100.0

    if len(unresolved) > UNRESOLVED_ALERT_THRESHOLD:
        await create_finance_alert(db, "unresolved_threshold", "high", f"{len(unresolved)} finance items are unresolved", {"count": len(unresolved)})
    if pdng_old:
        await create_finance_alert(db, "pdng_over_24h", "critical", f"{len(pdng_old)} PDNG payout entries are older than 24 hours", {"entries": pdng_old[:10]})
    if payout_monitor:
        await create_finance_alert(db, "payout_monitor_6h", "medium", f"{len(payout_monitor)} released payouts are older than 6 hours and still processing", {"transactions": payout_monitor[:10]})
    if payout_delayed:
        await create_finance_alert(db, "payout_delayed_24h", "high", f"{len(payout_delayed)} released payouts are older than 24 hours", {"transactions": payout_delayed[:10]})
    if payout_critical:
        await create_finance_alert(db, "payout_critical_48_business_hours", "critical", f"{len(payout_critical)} released payouts exceeded 48 business hours", {"transactions": payout_critical[:10]})
    if bank_settlement_pending_rows:
        await create_finance_alert(
            db,
            "processed_bank_settlement_pending",
            "high",
            BANK_SETTLEMENT_PENDING_MESSAGE,
            {
                "count": len(bank_settlement_pending_rows),
                "transactions": bank_settlement_pending_rows[:10],
                "internal_note": NO_RETRY_PROCESSED_NOTE,
            },
        )
    if new_negative_org_entries:
        await create_finance_alert(
            db,
            "new_negative_org_token_movement",
            "high",
            f"{len(new_negative_org_entries)} new negative org-token movements appeared after parser deployment",
            {"token_id": ORG_TOKEN_ID, "entries": new_negative_org_entries[:10]},
        )
    if residues:
        await create_finance_alert(db, "token_residue", "medium", f"{len(residues)} token residues exceed R{RESIDUE_ALERT_THRESHOLD:.2f}", {"residues": residues})
    if failed_withdrawals:
        await create_finance_alert(db, "withdrawal_failed", "critical", f"{failed_withdrawals} withdrawals are marked failed", {"count": failed_withdrawals})

    await db.finance_reconciliation_runs.insert_one({
        "mode": mode,
        "started_at": started_at,
        "completed_at": now_iso(),
        "transaction_count": len(txns),
        "token_count": len(token_ids),
        "metrics": metrics,
    })

    return {
        "mode": mode,
        "started_at": started_at,
        "completed_at": now_iso(),
        "transaction_count": len(txns),
        "token_count": len(token_ids),
        "metrics": metrics,
        "matches": matches,
        "tokens": [
            {
                "token_id": token_id,
                "balance": money(token_details.get(token_id, {}).get("balance")),
                "entries": token_entries.get(token_id, []),
                "summary": statement_summary(token_entries.get(token_id, [])),
            }
            for token_id in token_ids
        ],
    }


async def cleanup_finance_records(db) -> Dict[str, Any]:
    old_cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    duplicate_cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    old_logs = await db.finance_reconciliation_logs.delete_many({
        "created_at": {"$lt": old_cutoff},
        "requires_manual_review": {"$ne": True},
    })
    resolved_alerts = await db.finance_alerts.update_many(
        {"resolved": True, "resolved_at": {"$lt": duplicate_cutoff}},
        {"$set": {"archived": True}},
    )
    return {"old_logs_deleted": old_logs.deleted_count, "resolved_alerts_archived": resolved_alerts.modified_count}


async def get_finance_metrics(db) -> Dict[str, Any]:
    latest = await db.finance_reconciliation_runs.find_one({}, {"_id": 0}, sort=[("completed_at", -1)])
    if latest:
        alerts = await db.finance_alerts.find({"resolved": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
        return {
            **latest.get("metrics", {}),
            "last_successful_reconciliation_at": latest.get("completed_at"),
            "daily_reconciliation_status": "healthy" if latest.get("completed_at") else "unknown",
            "active_alerts": alerts,
        }
    result = await run_reconciliation(db, mode="recent", limit=150)
    return {
        **result["metrics"],
        "last_successful_reconciliation_at": result["completed_at"],
        "daily_reconciliation_status": "healthy",
        "active_alerts": await db.finance_alerts.find({"resolved": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50),
    }


async def export_finance_report(db, report: str, fmt: str = "json") -> Any:
    if report == "pending-bank-settlement":
        monitor = await get_payout_settlement_monitor(db, limit=1000)
        rows = [
            {
                "transaction id": row.get("transaction_id"),
                "TradeSafe transaction id": row.get("tradesafe_transaction_id"),
                "seller token": row.get("seller_token"),
                "amount": row.get("amount"),
                "released_at": row.get("released_at"),
                "processed_at": row.get("processed_at"),
                "status": row.get("status"),
                "age": row.get("age"),
                "recommended action": row.get("recommended_action"),
            }
            for row in monitor["pending_bank_settlement_rows"]
        ]
        if fmt.lower() == "csv":
            buffer = io.StringIO()
            fieldnames = [
                "transaction id",
                "TradeSafe transaction id",
                "seller token",
                "amount",
                "released_at",
                "processed_at",
                "status",
                "age",
                "recommended action",
            ]
            writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
            return buffer.getvalue()
        return {
            "report": "Pending Bank Settlement Report",
            "format": "json",
            "count": len(rows),
            "internal_note": NO_RETRY_PROCESSED_NOTE,
            "rows": rows,
        }

    latest = await run_reconciliation(db, mode="recent", limit=250)
    rows = latest["matches"]
    if report == "unresolved-payouts":
        rows = [row for row in rows if row["reconciliation_state"] != "reconciled"]
    elif report == "token-residues":
        rows = [
            {"token_id": token["token_id"], "balance": token["balance"]}
            for token in latest["tokens"]
            if (token.get("balance") or 0) > 0
        ]
    elif report == "org-token-movements":
        rows = [entry for token in latest["tokens"] if token["token_id"] == ORG_TOKEN_ID for entry in token["entries"]]
    elif report == "payout-aging":
        rows = sorted(rows, key=lambda row: row.get("age_hours") or 0, reverse=True)

    if fmt.lower() == "csv":
        buffer = io.StringIO()
        fieldnames = sorted({key for row in rows for key in row.keys()}) if rows else ["empty"]
        writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        return buffer.getvalue()
    return {"report": report, "format": "json", "count": len(rows), "rows": rows}
