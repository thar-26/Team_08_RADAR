"""Offline tests for sign-in tokens and company access rules."""
import time

import jwt
import pytest
from fastapi import HTTPException

from radar import auth


def _token(secret, **claims):
    body = {"sub": "anna@techinova.se", "name": "Anna", "aud": "radar-api", "exp": int(time.time()) + 300} | claims
    return jwt.encode(body, secret, algorithm="HS256")


def test_domain_match_rules():
    assert auth.domain_matches("anna@techinova.se", "https://www.techinova.se/")
    assert auth.domain_matches("lars@saab.com", "https://www.saab.com/")
    assert auth.domain_matches("lars@saabgroup.com", "https://www.saab.com/", "saab")  # approved alias
    assert not auth.domain_matches("anna@techinova.com", "https://www.techinova.se/")  # look-alike domain
    assert not auth.domain_matches("eve@saab.xyz", "https://www.saab.com/")
    assert not auth.domain_matches("eve@notsaab.com", "https://www.saab.com/")
    assert not auth.domain_matches("lars@gmail.com", "https://www.saab.com/")  # free mail never auto-matches
    assert not auth.domain_matches("eve@evil.se", "https://www.saab.com/")


def test_valid_token_gives_user(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "s3cret-for-tests")
    monkeypatch.setenv("RADAR_STAFF_EMAILS", "staff@bluesciencepark.se")
    user = auth.current_user(f"Bearer {_token('s3cret-for-tests')}")
    assert user["email"] == "anna@techinova.se" and user["staff"] is False


def test_forged_or_expired_token_rejected(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "s3cret-for-tests")
    with pytest.raises(HTTPException):
        auth.current_user(f"Bearer {_token('wrong-secret')}")
    with pytest.raises(HTTPException):
        auth.current_user(f"Bearer {_token('s3cret-for-tests', exp=int(time.time()) - 10)}")


def test_anonymous_blocked_when_login_configured(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "x")
    monkeypatch.setenv("AUTH_GOOGLE_ID", "id")
    assert auth.login_required()
    with pytest.raises(HTTPException) as e:
        auth.require(None, "techinova")
    assert e.value.status_code == 401
    auth.require(auth.SYSTEM, "techinova")  # staff/system passes


def test_no_login_provider_means_no_anonymous_edits(monkeypatch):
    monkeypatch.delenv("AUTH_GOOGLE_ID", raising=False)
    monkeypatch.delenv("AUTH_MICROSOFT_ENTRA_ID_ID", raising=False)
    assert not auth.can_access(None, "techinova")
    assert not auth.can_access({"email": "a@b.se", "name": "A", "staff": False}, "techinova")
