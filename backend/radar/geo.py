"""Where is something? Normalises free-text locations ("Karlskrona", "Digitalt",
"Lövsalen i biblioteket", "Gothenburg") into a region, for the geography factor
in matching and for the event filters."""
from __future__ import annotations

import re

REGIONS = ["blekinge", "stockholm", "vastra_gotaland", "skane", "other_se", "abroad", "online", "unknown"]

CITY_REGION = {
    "blekinge": ["karlskrona", "karlshamn", "ronneby", "sölvesborg", "solvesborg", "olofström", "olofstrom", "blekinge",
                 "gräsvik", "grasvik", "oasen", "lövsalen", "lovsalen", "netport"],
    "stockholm": ["stockholm", "kista", "solna", "sundbyberg", "södertälje", "sodertalje", "lidingö", "nacka", "täby", "uppsala"],
    "vastra_gotaland": ["göteborg", "goteborg", "gothenburg", "lindholmen", "borås", "boras", "trollhättan", "skövde",
                        "lysekil", "kristineberg", "fiskebäckskil", "västra götaland"],
    "skane": ["malmö", "malmo", "lund", "helsingborg", "kristianstad", "skåne", "skane", "hässleholm"],
    "other_se": ["norrköping", "norrkoping", "linköping", "linkoping", "luleå", "lulea", "umeå", "umea", "västerås",
                 "vasteras", "örebro", "orebro", "jönköping", "jonkoping", "kalmar", "växjö", "vaxjo", "gävle",
                 "gavle", "sundsvall", "karlstad", "halmstad", "borlänge", "piteå", "kiruna", "eskilstuna", "sweden", "sverige"],
}
# Venues and spellings -> the town people would filter by.
CITY_NAME = {"gräsvik": "Karlskrona", "grasvik": "Karlskrona", "oasen": "Karlskrona", "lövsalen": "Karlskrona",
             "lovsalen": "Karlskrona", "netport": "Karlshamn", "gothenburg": "Göteborg", "goteborg": "Göteborg",
             "lindholmen": "Göteborg", "malmo": "Malmö", "norrkoping": "Norrköping", "linkoping": "Linköping",
             "solvesborg": "Sölvesborg", "olofstrom": "Olofström", "sodertalje": "Södertälje", "boras": "Borås",
             "lulea": "Luleå", "umea": "Umeå", "vasteras": "Västerås", "orebro": "Örebro", "jonkoping": "Jönköping",
             "vaxjo": "Växjö", "gavle": "Gävle", "kristineberg": "Lysekil", "fiskebäckskil": "Lysekil"}
NOT_A_CITY = {"blekinge", "skåne", "skane", "västra götaland", "sweden", "sverige"}
ONLINE = re.compile(r"\b(online|digital|digitalt|webinar|webbinarium|virtual|virtuellt|zoom|teams)\b", re.I)
ABROAD = re.compile(r"\b(singapore|london|berlin|brussels|bryssel|paris|oslo|copenhagen|köpenhamn|helsinki|"
                    r"amsterdam|barcelona|new york|san francisco|tokyo|usa|germany|tyskland|denmark|danmark|norway|norge|finland)\b", re.I)
# Organisers whose events are on their own premises unless stated otherwise.
SOURCE_HOME = {"bth": "blekinge", "techconceptlab": "blekinge", "bsp": "blekinge", "almi": "blekinge",
               "netport": "blekinge", "regionblekinge": "blekinge", "mtc": "blekinge"}


def region_of(location: str | None, mode: str | None = None, source: str | None = None) -> tuple[str, str]:
    """(region key, city or '') for an event/testbed location."""
    loc = (location or "").strip()
    low = loc.lower()
    for region, cities in CITY_REGION.items():
        for c in cities:
            if re.search(rf"(?<![a-zåäö]){re.escape(c)}(?![a-zåäö])", low):
                return region, CITY_NAME.get(c, "" if c in NOT_A_CITY else c.title())
    m = ABROAD.search(low)
    if m:
        return "abroad", re.split(r"[,(]", loc)[0].strip() or m.group(0).title()
    if (mode or "") == "online" or ONLINE.search(low):
        return "online", ""
    if source in SOURCE_HOME and low not in ("unknown", ""):
        return SOURCE_HOME[source], ""  # a named room at the organiser's own site
    if source in SOURCE_HOME and (mode or "") == "in_person":
        return SOURCE_HOME[source], ""
    return "unknown", ""


def company_regions(slug: str) -> set[str]:
    """Regions a member is based in, from Blue Science Park's 'Ort' fact (default Blekinge)."""
    from . import db

    page = db.one("SELECT text FROM pages WHERE company_slug=? AND kind='bsp_member'", (slug,))
    text = (page or {}).get("text") or ""
    m = re.search(r"Ort:\s*([^.\n]+)", text)
    regions = {region_of(part)[0] for part in (m.group(1).split(",") if m else [])}
    regions.discard("unknown")
    return regions or {"blekinge"}
