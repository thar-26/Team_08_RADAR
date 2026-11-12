"""Offline tests for the Bolagsverket integration (no network, no keys)."""
import pytest

from radar.collectors.bolagsverket import name_similarity, normalise, normalise_orgnr

# Shaped like the API's documented answer (OrganisationerSvar), with sample values.
RAW = {
    "organisationer": [{
        "organisationsidentitet": {"identitetsbeteckning": "5560160680", "typ": {"kod": "ORGNR", "klartext": "Organisationsnummer"}},
        "organisationsnamn": {"organisationsnamnLista": [{"namn": "Telefonaktiebolaget LM Ericsson", "organisationsnamntyp": {"kod": "FORETAGSNAMN"}}]},
        "juridiskForm": {"kod": "49", "klartext": "Övriga aktiebolag"},
        "verksamOrganisation": {"kod": "JA"},
        "organisationsdatum": {"registreringsdatum": "1918-08-27"},
        "verksamhetsbeskrivning": {"beskrivning": "Utveckling av telekommunikationssystem"},
        "naringsgrenOrganisation": {"sni": [{"kod": "26300", "klartext": "Tillverkning av kommunikationsutrustning"}]},
        "postadressOrganisation": {"postadress": {"postort": "STOCKHOLM", "postnummer": "16483", "utdelningsadress": "Torshamnsgatan 21"}},
    }]
}


def test_orgnr_formats_and_checksum():
    assert normalise_orgnr("556016-0680") == "5560160680"
    assert normalise_orgnr("16 5560160680") == "5560160680"
    with pytest.raises(ValueError):
        normalise_orgnr("556016-0681")  # wrong check digit
    with pytest.raises(ValueError):
        normalise_orgnr("123")


def test_normalise_answer():
    d = normalise(RAW)
    assert d["orgnr"] == "5560160680"
    assert d["name"] == "Telefonaktiebolaget LM Ericsson"
    assert d["active"] is True
    assert d["sni"][0]["code"] == "26300"
    assert d["city"] == "STOCKHOLM"


def test_name_check():
    assert name_similarity("Telefonaktiebolaget LM Ericsson", "Ericsson") >= 0.6
    assert name_similarity("Ocean Harvesting Technologies AB", "Ocean Harvesting") >= 0.6
    assert name_similarity("Volvo Personvagnar AB", "Techinova") < 0.6
