# Kerpta — Schémas Pydantic pour la recherche d'entreprises (Sirene INSEE)
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from pydantic import BaseModel


class Address(BaseModel):
    voie: str | None = None
    complement: str | None = None
    code_postal: str | None = None
    commune: str | None = None
    pays: str = "France"


class Etablissement(BaseModel):
    siret: str
    nic: str
    siege: bool
    etat: str  # "A" = actif, "F" = fermé
    activite_principale: str | None = None  # Code NAF/APE, ex: "49.41B"
    date_creation: str | None = None
    adresse: Address


class CompanySearchResult(BaseModel):
    """Résultat de recherche — version compacte pour les listes."""

    siren: str
    denomination: str | None = None
    sigle: str | None = None
    activite_principale: str | None = None
    categorie_juridique: str | None = None
    categorie_juridique_libelle: str | None = None
    date_creation: str | None = None
    etat: str  # "Actif" ou "Cessé"
    tva_intracom: str  # ex: "FR12838377331"
    siege_adresse: Address | None = None
    siret_siege: str | None = None  # SIRET du siège social
    ca: float | None = None  # CA annuel le plus récent (None si non déclaré)


class FinanceYear(BaseModel):
    """Données financières annuelles extraites de l'API."""

    annee: str
    ca: float | None = None  # Chiffre d'affaires en euros


class CompanyDetails(BaseModel):
    """Détails complets d'une entreprise avec tous ses établissements actifs."""

    siren: str
    denomination: str | None = None
    nom_complet: str | None = None
    sigle: str | None = None
    activite_principale: str | None = None
    categorie_juridique: str | None = None
    categorie_juridique_libelle: str | None = None
    date_creation: str | None = None
    etat: str
    tva_intracom: str
    tranche_effectifs: str | None = None          # Code : "01", "12", etc.
    tranche_effectifs_libelle: str | None = None   # "10-19 salariés"
    tranche_effectifs_annee: str | None = None     # "2023"
    categorie_entreprise: str | None = None        # "PME", "ETI", "GE", "Micro"
    nombre_etablissements: int | None = None       # Total (ouverts)
    finances: list[FinanceYear] = []               # CA par année
    siege: Etablissement | None = None
    etablissements_actifs: list[Etablissement] = []
    nombre_etablissements_actifs: int = 0
