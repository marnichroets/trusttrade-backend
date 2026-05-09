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


async def get_all_statement_entries(token_id: str, first: int = 100) -> List[dict]:
    from tradesafe_service import get_token_statement

    entries: List[dict] = []
    page = 1
    while True:
        statement = await get_token_statement(token_id, first=first, page=page)
        entries.extend(normalize_statement_entry(entry) for entry in (statement.get("entries") or []))
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
    withdrawal_dt = parse_dt(txn.get("withdrawal_started_at") or txn.get("withdrawal_triggered_at"))
    settlement_dt = None
    for row in withdrawal_rows:
        if str(row.get("status") or "").upper() == "ACSP":
            settlement_dt = parse_dt(row.get("updatedAt") or row.get("createdAt"))
            break

    age_hours = None
    if release_dt:
        age_hours = round((datetime.now(timezone.utc) - release_dt).total_seconds() / 3600, 2)

    payout_duration_hours = None
    if release_dt and settlement_dt:
        payout_duration_hours = round((settlement_dt - release_dt).total_seconds() / 3600, 2)

    sla_status = "healthy"
    if final_state != "reconciled" and age_hours is not None:
        if age_hours >= PAYOUT_CRITICAL_HOURS:
            sla_status = "critical"
        elif age_hours >= PAYOUT_DELAYED_HOURS:
            sla_status = "delayed"

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
        "withdrawal_requested_at": txn.get("withdrawal_started_at") or txn.get("withdrawal_triggered_at"),
        "settlement_confirmed_at": settlement_dt.isoformat() if settlement_dt else None,
        "payout_duration_hours": payout_duration_hours,
        "payout_sla_status": sla_status,
        "age_hours": age_hours,
        "requires_manual_review": final_state != "reconciled",
    }


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
    if (metrics.get("org_token_balance") or 0) < 0:
        score -= min(15, int(abs(metrics["org_token_balance"])))
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
    residues = []
    negative_balances = []
    for token_id, token in token_details.items():
        balance = money(token.get("balance")) or 0
        if balance > RESIDUE_ALERT_THRESHOLD:
            residues.append({"token_id": token_id, "balance": balance})
        if balance < 0:
            negative_balances.append({"token_id": token_id, "balance": balance})

    failed_withdrawals = await db.transactions.count_documents({"withdrawal_status": "failed"})
    metrics = {
        "unresolved_count": len(unresolved),
        "pdng_count": len(summary["pdng_entries"]),
        "acsp_count": len(summary["acsp_entries"]),
        "pdng_over_24h": len(pdng_old),
        "failed_withdrawals": failed_withdrawals,
        "missing_statement_entry_count": sum(1 for match in matches if match["reconciliation_state"] == "missing_statement_entry"),
        "org_token_balance": org_balance,
        "total_fees": summary["totals"]["agent_fees"],
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
    if org_balance <= ORG_NEGATIVE_ALERT_THRESHOLD:
        await create_finance_alert(db, "negative_org_token", "high", f"Org token balance is {org_balance}", {"token_id": ORG_TOKEN_ID, "balance": org_balance})
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
