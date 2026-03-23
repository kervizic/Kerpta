# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

# Import de tous les modèles pour qu'Alembic les détecte automatiquement

from app.models.base import Base  # noqa: F401
from app.models.user import User, OrganizationMembership, Invitation, OrganizationJoinRequest  # noqa: F401
from app.models.organization import Organization  # noqa: F401
from app.models.client import Client, Supplier  # noqa: F401
from app.models.product import (  # noqa: F401
    PriceCoefficient,
    Product,
    ClientProductVariant,
    ProductPurchaseLink,
    ProductComponent,
)
from app.models.quote import Quote, QuoteLine  # noqa: F401
from app.models.invoice import Invoice, InvoiceLine, Payment  # noqa: F401
from app.models.order import Order, OrderLine, order_quotes, order_invoices  # noqa: F401
from app.models.purchase import (  # noqa: F401
    SupplierQuote,
    SupplierQuoteLine,
    SupplierOrder,
    SupplierOrderLine,
    SupplierInvoice,
    SupplierInvoiceLine,
)
from app.models.accounting import JournalEntry, JournalEntryLine, TaxDeclaration  # noqa: F401
from app.models.payroll import Employee, Payslip  # noqa: F401
from app.models.expense import Expense  # noqa: F401
from app.models.contract import Contract, Situation, SituationLine  # noqa: F401
from app.models.platform import (  # noqa: F401
    PlatformConfig,
    PlatformAdminLog,
    OrganizationStorageConfig,
)
from app.models.attachment import Attachment, DocumentAttachment  # noqa: F401
from app.models.ai_provider import AiProvider  # noqa: F401
from app.models.ai_model import AiModel  # noqa: F401
from app.models.ai_usage_log import AiUsageLog  # noqa: F401
from app.models.ai_categorization import AiCategorizationHistory  # noqa: F401
