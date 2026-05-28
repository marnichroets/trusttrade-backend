"""
Unit tests for the bank-account-number sync guard.

Covers the root-level validator in tradesafe_service that every banking-sync
path runs through. These tests stay offline — no DB, no TradeSafe API calls —
so they run anywhere without configuration.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tradesafe_service import (
    BANK_ACCOUNT_MIN_DIGITS,
    banking_needs_update,
    has_valid_banking_for_payout,
    validate_account_number_for_sync,
)


class TestValidateAccountNumberForSync:
    def test_minimum_is_eleven_digits(self):
        assert BANK_ACCOUNT_MIN_DIGITS == 11

    def test_eleven_digit_number_is_valid(self):
        result = validate_account_number_for_sync("62123456789")
        assert result["valid"] is True
        assert result["cleaned"] == "62123456789"
        assert result["error"] is None
        assert result["code"] is None

    def test_strips_whitespace_and_spaces(self):
        result = validate_account_number_for_sync("  62 123 456 789  ")
        assert result["valid"] is True
        assert result["cleaned"] == "62123456789"

    def test_rejects_four_digit_truncation_bug(self):
        result = validate_account_number_for_sync("6789")
        assert result["valid"] is False
        assert result["code"] == "TOO_SHORT"
        assert "11 digits" in result["error"]

    def test_rejects_ten_digits_strictly(self):
        result = validate_account_number_for_sync("1234567890")
        assert result["valid"] is False
        assert result["code"] == "TOO_SHORT"

    def test_rejects_empty(self):
        for value in (None, "", "   "):
            result = validate_account_number_for_sync(value)
            assert result["valid"] is False
            assert result["code"] == "MISSING"

    def test_rejects_non_digit(self):
        result = validate_account_number_for_sync("123abc4567")
        assert result["valid"] is False
        assert result["code"] == "NON_DIGIT"

    def test_accepts_integer_input(self):
        result = validate_account_number_for_sync(62123456789)
        assert result["valid"] is True
        assert result["cleaned"] == "62123456789"


class TestHasValidBankingForPayout:
    def test_none_user(self):
        assert has_valid_banking_for_payout(None) is False

    def test_completed_flag_off(self):
        user = {
            "banking_details_completed": False,
            "banking_details": {"bank_name": "FNB", "account_number": "62123456789"},
        }
        assert has_valid_banking_for_payout(user) is False

    def test_no_bank_name(self):
        user = {
            "banking_details_completed": True,
            "banking_details": {"account_number": "62123456789"},
        }
        assert has_valid_banking_for_payout(user) is False

    def test_short_account_number(self):
        user = {
            "banking_details_completed": True,
            "banking_details": {"bank_name": "FNB", "account_number": "6789"},
        }
        assert has_valid_banking_for_payout(user) is False

    def test_valid(self):
        user = {
            "banking_details_completed": True,
            "banking_details": {"bank_name": "FNB", "account_number": "62123456789"},
        }
        assert has_valid_banking_for_payout(user) is True


class TestBankingNeedsUpdate:
    def test_none_user(self):
        assert banking_needs_update(None) is False

    def test_no_banking_at_all(self):
        assert banking_needs_update({"banking_details": {}}) is False

    def test_invalid_stored_account_number(self):
        user = {"banking_details": {"account_number": "6789"}}
        assert banking_needs_update(user) is True

    def test_valid_stored_account_number(self):
        user = {"banking_details": {"account_number": "62123456789"}}
        assert banking_needs_update(user) is False


class TestSyncGuardRejectsInvalid:
    """End-to-end: calling sync_banking_to_token with an invalid account number
    must return a structured failure WITHOUT contacting TradeSafe.

    Uses asyncio.run rather than pytest-asyncio so the test runs in any env.
    """

    def test_sync_banking_to_token_rejects_short_number(self, monkeypatch):
        import asyncio
        import tradesafe_service

        called = {"graphql": False}

        async def _explode(*a, **kw):
            called["graphql"] = True
            raise AssertionError("execute_graphql must not be called when guard fires")

        monkeypatch.setattr(tradesafe_service, "execute_graphql", _explode)

        result = asyncio.run(
            tradesafe_service.sync_banking_to_token(
                token_id="tok_test",
                bank_name="FNB",
                account_number="6789",
                branch_code="250655",
                account_type="cheque",
            )
        )

        assert result["success"] is False
        assert result["code"] == "TOO_SHORT"
        assert result["field"] == "account_number"
        assert called["graphql"] is False

    def test_update_token_banking_details_rejects_short_number(self, monkeypatch):
        import asyncio
        import tradesafe_service

        called = {"graphql": False}

        async def _explode(*a, **kw):
            called["graphql"] = True
            raise AssertionError("execute_graphql must not be called when guard fires")

        monkeypatch.setattr(tradesafe_service, "execute_graphql", _explode)

        result = asyncio.run(
            tradesafe_service.update_token_banking_details(
                token_id="tok_test",
                bank_name="FNB",
                account_holder="Test User",
                account_number="6789",
                branch_code="250655",
            )
        )

        assert result["success"] is False
        assert result["code"] == "TOO_SHORT"
        assert called["graphql"] is False
