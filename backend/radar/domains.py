"""Domains (fields) for browsing: which fields an opportunity or a member belongs to.

Uses the same local multilingual embeddings as the Matcher (no language model,
no cost): each field has a few example phrases in Swedish and English, and an
item belongs to the 1-3 fields its text is closest to."""
from __future__ import annotations

import numpy as np

from . import db, embed

DOMAINS: dict[str, dict[str, str]] = {
    "energy": {"sv": "Energi", "en": "Energy",
               "d": "Energi: förnybar energi, elnät, energilagring, vätgas, vindkraft, solenergi, vågkraft. Energy: renewable power, electricity grids, storage, hydrogen, wind, solar, wave power."},
    "marine": {"sv": "Marin teknik & hav", "en": "Marine & ocean",
               "d": "Marin teknik och hav: sjöfart, fartyg, undervattensteknik, hamnar, vattenbruk, havsmiljö. Marine and ocean: shipping, vessels, underwater technology, ports, aquaculture, ocean environment."},
    "defence": {"sv": "Försvar & säkerhet", "en": "Defence & security",
                "d": "Försvar och säkerhet: försvarsteknik, försvarsmakten, krisberedskap, övervakning, skydd. Defence and security: military technology, armed forces, crisis preparedness, surveillance."},
    "digital": {"sv": "Digitalisering & AI", "en": "Digital & AI",
                "d": "Digitalisering och AI: mjukvara, artificiell intelligens, data, molntjänster, 5G, 6G, IoT, telekom. Digital and AI: software, artificial intelligence, data, cloud, 5G, 6G, IoT, telecom."},
    "cyber": {"sv": "Cybersäkerhet", "en": "Cybersecurity",
              "d": "Cybersäkerhet: informationssäkerhet, säkra system, dataintrång, skydd av nätverk. Cybersecurity: information security, secure systems, cyber attacks, network protection."},
    "health": {"sv": "Hälsa & life science", "en": "Health & life science",
               "d": "Hälsa och life science: medicinteknik, vård, läkemedel, kliniska studier, välfärdsteknik. Health and life science: medical technology, healthcare, pharmaceuticals, clinical trials."},
    "food": {"sv": "Livsmedel & jordbruk", "en": "Food & agriculture",
             "d": "Livsmedel och jordbruk: mat, livsmedelssystem, lantbruk, skogsbruk, fiske. Food and agriculture: food systems, farming, forestry, fisheries."},
    "mobility": {"sv": "Transport & mobilitet", "en": "Transport & mobility",
                 "d": "Transport och mobilitet: fordon, elektrifiering av transporter, logistik, flyg, drönare, autonoma fordon. Transport and mobility: vehicles, electric transport, logistics, aviation, drones, autonomous vehicles."},
    "industry": {"sv": "Industri & tillverkning", "en": "Industry & manufacturing",
                 "d": "Industri och tillverkning: produktion, automation, material, kemi, halvledare, robotik. Industry and manufacturing: production, automation, materials, chemistry, semiconductors, robotics."},
    "climate": {"sv": "Miljö & klimat", "en": "Environment & climate",
                "d": "Miljö, klimat och hållbarhet: utsläpp, cirkulär ekonomi, vatten, biologisk mångfald, återvinning. Environment, climate and sustainability: emissions, circular economy, water, biodiversity, recycling."},
    "space": {"sv": "Rymd", "en": "Space",
              "d": "Rymd: satelliter, raketer, jordobservation, rymdteknik. Space: satellites, rockets, earth observation, space technology."},
    "built": {"sv": "Samhällsbyggnad", "en": "Built environment",
              "d": "Samhällsbyggnad: byggande, fastigheter, smarta städer, infrastruktur, bostäder. Built environment: construction, real estate, smart cities, infrastructure, housing."},
    "creative": {"sv": "Kultur & kreativa näringar", "en": "Culture & creative",
                 "d": "Kultur och kreativa näringar: media, film, spel, design, visualisering, upplevelser. Culture and creative industries: media, film, games, design, visualisation, experiences."},
    "business": {"sv": "Affärsutveckling & tillväxt", "en": "Business & growth",
                 "d": "Affärsutveckling och tillväxt: entreprenörskap, startups, finansiering, export, internationalisering, innovation i företag. Business and growth: entrepreneurship, startups, financing, export, internationalisation."},
}

# Short example phrases per field (Swedish and English). An item's closeness to a
# field is its closeness to the nearest phrase, corrected for fields that are
# close to almost everything.
ANCHORS: dict[str, list[str]] = {
    "energy": ["renewable energy", "electricity grid and smart grids", "energy storage and batteries", "hydrogen",
               "wind and solar power", "wave and tidal energy", "förnybar energi", "elnät och energisystem"],
    "marine": ["maritime shipping and vessels", "underwater technology and sonar", "ports and harbours", "ocean and sea",
               "aquaculture and fisheries", "marin teknik", "sjöfart och hamnar", "havet och undervattensmiljö"],
    "defence": ["defence and military technology", "armed forces", "security and crisis preparedness", "dual-use technology",
                "försvar och säkerhet", "försvarsmakten"],
    "digital": ["artificial intelligence and machine learning", "software and digital platforms", "data and cloud",
                "5G 6G telecom and connectivity", "internet of things", "AI och digitalisering", "mjukvara och data"],
    "cyber": ["cybersecurity", "information security", "cyber attacks and resilience", "cybersäkerhet", "informationssäkerhet"],
    "health": ["healthcare and medicine", "medical technology", "pharmaceuticals and clinical trials", "life science",
               "hälsa och vård", "medicinteknik"],
    "food": ["food systems", "agriculture and farming", "forestry", "livsmedel", "jordbruk och lantbruk"],
    "mobility": ["vehicles and automotive", "electric transport", "logistics", "aviation and drones", "autonomous vehicles",
                 "transport och fordon"],
    "industry": ["manufacturing and production", "industrial automation and robotics", "materials and chemistry",
                 "semiconductors and chips", "industri och tillverkning"],
    "climate": ["climate change and emissions", "circular economy and recycling", "water and environment", "biodiversity",
                "miljö och klimat", "cirkulär ekonomi"],
    "space": ["space technology", "satellites and earth observation", "rockets and launchers", "rymd"],
    "built": ["construction and buildings", "smart cities and urban development", "infrastructure", "housing and real estate",
              "samhällsbyggnad och fastigheter"],
    "creative": ["media and film", "games and gaming", "design and visualisation", "culture and creative industries",
                 "kultur och kreativa näringar"],
    "business": ["entrepreneurship and startups", "business growth and scale-up", "export and internationalisation",
                 "venture capital and financing for companies", "affärsutveckling och tillväxt", "företagande"],
}
_CACHE: dict[tuple, dict[str, list[tuple[str, float]]]] = {}


def name(key: str, lang: str) -> str:
    return DOMAINS[key]["sv" if lang == "sv" else "en"]


def _domain_matrix() -> tuple[list[str], list[np.ndarray]]:
    keys = list(DOMAINS)
    vec = embed.vectors({f"anchor:{k}:{i}": a for k in keys for i, a in enumerate(ANCHORS[k])})
    return keys, [np.stack([vec[f"anchor:{k}:{i}"] for i in range(len(ANCHORS[k]))]) for k in keys]


def _scores(X: np.ndarray, mats: list[np.ndarray]) -> np.ndarray:
    """items x fields: nearest phrase per field, minus that field's average closeness."""
    S = np.stack([(X @ m.T).max(axis=1) for m in mats], axis=1)
    return S - S.mean(axis=0, keepdims=True)


def _assign(sims: np.ndarray, keys: list[str]) -> list[tuple[str, float]]:
    """The closest field always counts; up to two more if almost as close."""
    order = np.argsort(-sims)
    best = float(sims[order[0]])
    out = [(keys[order[0]], round(best, 3))]
    for i in order[1:3]:
        if float(sims[i]) >= best - 0.03 and float(sims[i]) > 0.02:
            out.append((keys[i], round(float(sims[i]), 3)))
    return out


def opportunity_domains() -> dict[str, list[tuple[str, float]]]:
    """{opportunity id: [(domain, similarity), ...]} for every opportunity."""
    opps = db.rows("SELECT id, text FROM opportunities")
    key = ("opp", len(opps), (db.one("SELECT MAX(fetched_at) AS t FROM opportunities") or {}).get("t"))
    if key in _CACHE:
        return _CACHE[key]
    keys, mats = _domain_matrix()
    vec = embed.vectors({f"opp:{o['id']}": o["text"] for o in opps})
    S = _scores(np.stack([vec[f"opp:{o['id']}"] for o in opps]), mats)
    out = {o["id"]: _assign(S[i], keys) for i, o in enumerate(opps)}
    _CACHE.clear() if len(_CACHE) > 8 else None
    _CACHE[key] = out
    return out


def member_domains() -> dict[str, list[tuple[str, float]]]:
    """{member slug: [(domain, similarity), ...]} from the members' public descriptions."""
    from .agents.connector import public_text

    members = db.rows("SELECT slug FROM companies WHERE slug NOT LIKE 'sim-%'")
    key = ("member", len(members), (db.one("SELECT MAX(updated_at) AS t FROM companies") or {}).get("t"))
    if key in _CACHE:
        return _CACHE[key]
    keys, mats = _domain_matrix()
    vec = embed.vectors({f"member:{m['slug']}": public_text(m["slug"]) for m in members})
    have = [m for m in members if f"member:{m['slug']}" in vec]
    S = _scores(np.stack([vec[f"member:{m['slug']}"] for m in have]), mats)
    out = {m["slug"]: _assign(S[i], keys) for i, m in enumerate(have)}
    _CACHE[key] = out
    return out
