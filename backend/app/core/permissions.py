# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from typing import Final

ALL_PERMISSIONS: Final = [
    # Ventes
    "quotes:read",
    "quotes:write",
    "invoices:read",
    "invoices:write",
    "orders:read",
    "orders:write",
    # Achats
    "purchases:read",
    "purchases:write",
    # RH / Paie
    "payroll:self",
    "payroll:manage",
    # Notes de frais
    "expenses:submit",
    "expenses:validate",
    # Comptabilite
    "accounting:read",
    "accounting:write",
    # Import IA + Documents
    "imports:read",
    "imports:write",
    "documents:read",
    "documents:write",
    # Tresorerie
    "treasury:read",
    "treasury:write",
    # Administration
    "members:manage",
    "org:manage",
]

ROLE_PERMISSIONS: Final[dict[str, list[str]]] = {
    "owner": list(ALL_PERMISSIONS),
    "accountant": [
        "quotes:read",
        "quotes:write",
        "invoices:read",
        "invoices:write",
        "orders:read",
        "orders:write",
        "purchases:read",
        "purchases:write",
        "payroll:self",
        "payroll:manage",
        "expenses:submit",
        "expenses:validate",
        "accounting:read",
        "accounting:write",
        "imports:read",
        "imports:write",
        "documents:read",
        "documents:write",
        "treasury:read",
        "treasury:write",
    ],
    "commercial": [
        "quotes:read",
        "quotes:write",
        "invoices:read",
        "invoices:write",
        "orders:read",
        "orders:write",
        "imports:read",
        "imports:write",
        "documents:read",
        "documents:write",
    ],
    "employee": [
        "payroll:self",
        "expenses:submit",
        "documents:read",
    ],
}


def get_permissions(
    role: str, custom_permissions: list[str] | None = None
) -> list[str]:
    """Retourne la liste des permissions effectives selon le rôle."""
    if role == "custom":
        return custom_permissions or []
    return ROLE_PERMISSIONS.get(role, [])


def has_permission(
    role: str,
    custom_permissions: list[str] | None,
    permission: str,
) -> bool:
    """Vérifie si un rôle possède une permission donnée."""
    return permission in get_permissions(role, custom_permissions)
