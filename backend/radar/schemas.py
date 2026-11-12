"""Data contracts shared by agents, API and frontend."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SECTIONS = [
    "offerings",       # products and services
    "technologies",    # technologies and expertise
    "applications",    # application areas
    "markets",         # markets, industries, customer groups
    "geography",       # geographical focus
    "priorities",      # publicly stated development priorities, projects, collaborations
    "interests",       # topics/opportunities that MAY be relevant (always inferred)
]


# ---------- Profiler agent output (LLM) ----------
class LLMClaim(BaseModel):
    section: Literal["offerings", "technologies", "applications", "markets", "geography", "priorities", "interests"]
    statement: str = Field(description="One short, specific statement in English.")
    status: Literal["fact", "inferred"] = Field(
        description="fact = explicitly stated in a source; inferred = your reasoning, not stated."
    )
    quote: str = Field(description="For facts: exact verbatim sentence fragment copied from the source text (original language). For inferred: empty string.")
    source_id: int = Field(description="Number of the source the quote comes from, or the main source the inference is based on.")
    reasoning: str = Field(description="For inferred claims: one sentence explaining the inference. For facts: empty string.")


class LLMMissing(BaseModel):
    section: str
    note: str


class LLMProfile(BaseModel):
    summary: str = Field(description="Two neutral sentences on what the company does, based only on facts.")
    size_hint: Literal["startup", "sme", "large", "public_sector", "unknown"]
    size_basis: str
    claims: list[LLMClaim]
    missing: list[LLMMissing]


# ---------- Stored profile (after verification) ----------
class Evidence(BaseModel):
    quote: str
    url: str
    retrieved_at: str
    verified: bool = False


class Claim(BaseModel):
    id: str
    section: str
    statement: str
    status: Literal["fact", "inferred", "company_confirmed"]
    evidence: list[Evidence] = []
    reasoning: str = ""
    origin: Literal["agent", "user"] = "agent"
    review: Literal["unreviewed", "confirmed", "rejected", "edited"] = "unreviewed"
    note: str = ""


class Profile(BaseModel):
    slug: str
    name: str
    website: str
    summary: str
    size_hint: str
    size_basis: str
    claims: list[Claim]
    missing: list[LLMMissing]
    sources: list[dict]
    generated_at: str
    verifier: dict = {}


# ---------- Matcher agent output ----------
class Requirement(BaseModel):
    requirement: str
    status: Literal["likely_met", "unknown", "likely_not_met"]
    basis: str


class MatchExplanation(BaseModel):
    relevance: Literal["strong", "possible", "weak"]
    why: str = Field(description="1-2 sentences: why this could matter to this company, citing profile points.")
    profile_points: list[str] = Field(description="Profile statements the match relies on (copied).")
    requirements: list[Requirement]
    uncertainties: list[str]
    next_step: str


# ---------- Connector agent output ----------
class ConnectionBasis(BaseModel):
    worth_suggesting: bool
    headline: str
    shared: list[str] = Field(description="Specific shared technologies/markets/needs, each grounded in both profiles.")
    complementary: str = Field(description="How the companies' capabilities could complement each other.")
    caution: str = Field(description="What is uncertain; state that neither company has expressed interest.")


# ---------- Event extraction ----------
class LLMEvent(BaseModel):
    title: str
    date: str = Field(description="ISO date YYYY-MM-DD of the (first) event day, or empty if not stated.")
    end_date: str
    location_mode: Literal["online", "in_person", "hybrid", "unknown"]
    location: str
    audience: str
    summary: str = Field(description="One or two sentences in English.")
    url: str = Field(description="Link to the event page if present in the listing, else empty.")


class LLMEventList(BaseModel):
    events: list[LLMEvent]


# ---------- Guard / concierge ----------
class GuardVerdict(BaseModel):
    category: Literal["relevant", "unclear", "unrelated", "override_attempt", "needs_human", "other_company_private"]
    reason: str
    clarifying_question: str


class Citation(BaseModel):
    ref: str = Field(description="Reference id like O3 or P2 from the context.")


class ConciergeAnswer(BaseModel):
    answer: str
    citations: list[Citation]
    next_step: str
    refer_to_staff: bool
