# Intelligence Artificielle — Architecture & Configuration

## Principes

- **Aucune configuration IA par défaut.** Kerpta s'installe et fonctionne sans IA. Pas de conteneur au premier démarrage.
- **Activation et configuration par le super-admin uniquement** (`is_platform_admin = true`, depuis `admin.kerpta.fr → IA`).
- **N'importe quel fournisseur** peut être connecté : Ollama local, vLLM, OpenAI, Anthropic, Mistral, Google, ou tout endpoint compatible OpenAI.
- **3 rôles de modèle** : le super-admin assigne un modèle à chaque rôle parmi ceux disponibles chez ses fournisseurs.
- **Les organisations ne configurent rien côté infra.** Elles activent/désactivent les fonctionnalités IA depuis Paramètres → Modules.

---

## Stack technique

```
                 ┌──────────────────────────────────────────┐
                 │             Kerpta FastAPI                │
                 │         app/services/ai.py                │
                 └──────────────┬───────────────────────────┘
                                │  HTTP (format OpenAI)
                                ▼
                 ┌──────────────────────────────────────────┐
                 │           LiteLLM Proxy                   │
                 │        (conteneur Docker)                 │
                 │     port 4000 — réseau interne            │
                 └──┬──────────┬──────────────┬─────────────┘
                    │          │              │
                    ▼          ▼              ▼
              ┌──────────┐ ┌──────────┐ ┌───────────────┐
              │  vLLM    │ │ Ollama   │ │ API externes  │
              │ (GPU/CPU)│ │ (CPU)    │ │ OpenAI, Claude│
              │ port 8000│ │ port 11434│ │ Mistral, etc. │
              └──────────┘ └──────────┘ └───────────────┘
```

- **LiteLLM** : gateway unique. FastAPI ne parle qu'à LiteLLM. Routing, fallback, cost tracking.
- **vLLM / Ollama** : servent les modèles locaux. API OpenAI-compatible.
- **API cloud** : tout fournisseur externe (clé API).

---

## Les 3 rôles de modèle

Kerpta utilise l'IA via **3 rôles fonctionnels**. Le super-admin assigne un modèle à chaque rôle :

| Rôle | Usage dans Kerpta | Type de modèle attendu | Exemples |
|---|---|---|---|
| **VL** (Vision-Language) | OCR de factures, extraction de documents scannés, lecture de justificatifs | Modèle multimodal capable de lire des images | PaddleOCR-VL 1.5, GPT-4o, Claude Sonnet, Gemini |
| **Instruct** | Catégorisation comptable, suggestions PCG, génération de texte (résolutions PV, mails de relance), assistant chat simple | Modèle texte rapide, bon en suivi d'instructions | Mistral 7B, Llama 3.1 8B, GPT-4o-mini, Claude Haiku |
| **Thinking** | Analyse financière complexe, vérification de cohérence comptable, questions ouvertes sur le bilan | Modèle de raisonnement avancé, plus lent mais plus précis | Claude Opus, GPT-o1, Qwen QwQ, DeepSeek R1 |

**Chaque rôle est optionnel.** Si seul le rôle VL est configuré, seules les fonctionnalités OCR sont disponibles. Si aucun rôle n'est assigné, l'IA est inactive.

**Un même modèle peut être assigné à plusieurs rôles** (ex: GPT-4o comme VL et Instruct).

---

## Interface super-admin — page unique

`admin.kerpta.fr → Intelligence Artificielle`

Une seule page scrollable avec plusieurs sections empilées. Le super-admin configure tout depuis cette page.

```
┌─────────────────────────────────────────────────────────────┐
│  Intelligence Artificielle                                   │
│                                                              │
│  ── Section 1 : Général ──────────────────────────────────  │
│                                                              │
│  Module IA    [● Activé / ○ Désactivé]                      │
│  LiteLLM URL  [http://litellm:4000        ]                │
│  Master Key   [••••••••••••••••            ]                │
│               [Tester la connexion LiteLLM]                  │
│                                                              │
│  ── Section 2 : Fournisseurs ─────────────────────────────  │
│                                                              │
│  ● Mon Ollama       ollama    http://ollama:11434     [●]   │
│    └── 3 modèles détectés        [Sync] [Tester] [Éditer]  │
│  ● OpenAI Prod      openai   ••••••••                [●]   │
│    └── 12 modèles détectés       [Sync] [Tester] [Éditer]  │
│                                                              │
│  [+ Ajouter un fournisseur]                                  │
│                                                              │
│  ── Section 3 : Modèles ─────────────────────────────────  │
│                                                              │
│  Mon Ollama                                                  │
│    mistral:7b          chat               [●]               │
│    llava:13b           vision, chat       [●]               │
│  OpenAI Prod                                                 │
│    gpt-4o              vision, chat       [●]               │
│    gpt-4o-mini         chat               [●]               │
│                                                              │
│  [+ Ajouter un modèle manuellement]                         │
│                                                              │
│  ── Section 4 : Rôles ───────────────────────────────────  │
│                                                              │
│  VL (Vision)     [▼ llava:13b (Mon Ollama)              ]  │
│  Instruct        [▼ mistral:7b (Mon Ollama)             ]  │
│  Thinking        [▼ gpt-4o (OpenAI Prod)                ]  │
│                                                              │
│  [Tester les rôles]  [Sauvegarder]                          │
│                                                              │
│  ── Section 5 : Fonctionnalités ──────────────────────────  │
│                                                              │
│  OCR factures         [● Activé]  (requiert : VL)           │
│  Catégorisation PCG   [● Activé]  (requiert : Instruct)    │
│  Assistant chat       [○ Désactivé] (requiert : Instruct)  │
│  Aide à la rédaction  [● Activé]  (requiert : Instruct)    │
│  Analyse financière   [○ Désactivé] (requiert : Thinking)  │
│                                                              │
│  ── Section 6 : Usage ────────────────────────────────────  │
│                                                              │
│  Tokens ce mois : 142 350 in / 38 200 out                   │
│  Appels : VL 89 | Instruct 234 | Thinking 12                │
│  [Graphique barres 30 jours]                                 │
│  Top organisations : Dupont SARL (45%), Martin SAS (30%)    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Section 1 — Général

Active/désactive l'IA sur la plateforme (`platform_config.ai_enabled`). Configure l'URL et la clé master LiteLLM. Bouton de test de connexion.

Pré-requis : le conteneur LiteLLM doit être ajouté au `docker-compose.prod.yml` et joignable.

### Section 2 — Fournisseurs

Le super-admin clique "Ajouter un fournisseur" et choisit le type :

| Type | Config | Récupération des modèles |
|---|---|---|
| Ollama | URL (ex: `http://ollama:11434`) | Auto via `GET /api/tags` |
| vLLM | URL (ex: `http://vllm:8000/v1`) | Auto via `GET /v1/models` |
| OpenAI | Clé API | Auto via `GET /v1/models` |
| Anthropic | Clé API | Liste prédéfinie (Haiku, Sonnet, Opus) |
| Mistral | Clé API | Auto via `GET /v1/models` |
| Google (Gemini) | Clé API | Liste prédéfinie |
| Custom (OpenAI-compatible) | URL + Clé API | Auto via `GET /v1/models` ou saisie manuelle |

À la connexion, Kerpta interroge le fournisseur pour récupérer la **liste des modèles disponibles** et les stocke dans `ai_models`. Le super-admin peut aussi ajouter des modèles manuellement.

Chaque fournisseur affiche un indicateur de connectivité (vert/rouge), le nombre de modèles détectés, et des boutons Sync / Tester / Éditer / Supprimer.

### Section 3 — Modèles

Liste de tous les modèles groupés par fournisseur. Capabilities affichées en badges. Toggle actif/inactif par modèle. Possibilité d'ajouter un modèle manuellement.

### Section 4 — Rôles

3 dropdowns (VL, Instruct, Thinking) avec la liste de tous les modèles actifs de tous les fournisseurs. Bouton "Tester les rôles" qui envoie un prompt de test à chaque rôle pour vérifier que la chaîne fonctionne (FastAPI → LiteLLM → provider → modèle → réponse).

### Section 5 — Fonctionnalités

Le super-admin active/désactive chaque fonctionnalité. Une fonctionnalité est grisée si le rôle requis n'est pas assigné :

| Fonctionnalité | Rôle requis | Description |
|---|---|---|
| OCR factures | VL | Scan → extraction structurée |
| Catégorisation PCG | Instruct | Suggestion de compte comptable |
| Assistant chat | Instruct + Thinking | Chat contextuel sidebar |
| Aide à la rédaction | Instruct | Génération PV, mails, descriptions |
| Analyse financière | Thinking | Questions complexes sur le bilan |

### Section 6 — Usage

Stats d'usage en temps réel : tokens consommés (in/out), nombre d'appels par rôle, graphique barres sur 30 jours glissants, répartition par organisation (top 5).

---

## Fonctionnalités IA exposées aux organisations

### OCR de factures fournisseur (rôle VL)

Extraction automatique depuis un scan/photo :
- Numéro de facture, date, date d'échéance
- Fournisseur (nom, SIRET, adresse)
- Lignes (désignation, quantité, prix unitaire, TVA)
- Montant HT, TVA, TTC
- IBAN (si présent)

Workflow : Achat → Factures → Nouvelle → "Scanner". Le modèle VL extrait, pré-remplit le formulaire, l'utilisateur valide.

### Catégorisation comptable (rôle Instruct)

Suggestion automatique du compte PCG :
- Analyse le libellé, le fournisseur, le montant
- Propose le compte le plus probable avec un score de confiance
- Apprentissage des choix utilisateur via `ai_categorization_history`

### Assistant chat (rôles Instruct + Thinking)

Chat contextuel dans la sidebar :
- Questions simples (CA du mois, factures en retard) → Instruct
- Questions complexes (analyse de trésorerie, cohérence bilan) → Thinking
- Contexte injecté via RAG (pgvector sur PostgreSQL existant)
- Données locales si providers locaux — rien ne sort du serveur

### Aide à la rédaction (rôle Instruct)

Génération assistée :
- Résolutions de PV d'AG (pré-remplissage avec données comptables)
- E-mails de relance client
- Descriptions de produits/services

---

## Configuration BDD

### Ajouts à `platform_config`

| Colonne | Type | Notes |
|---|---|---|
| ai_enabled | BOOLEAN DEFAULT false | active le module IA sur la plateforme |
| ai_litellm_base_url | VARCHAR(255) | URL du proxy LiteLLM (ex: `http://litellm:4000`) |
| ai_litellm_master_key | TEXT | clé master LiteLLM (chiffrée) |
| ai_role_vl_model_id | UUID FK ai_models | nullable — modèle assigné au rôle VL |
| ai_role_instruct_model_id | UUID FK ai_models | nullable — modèle assigné au rôle Instruct |
| ai_role_thinking_model_id | UUID FK ai_models | nullable — modèle assigné au rôle Thinking |

### Table `ai_providers`

Chaque fournisseur connecté par le super-admin.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(100) | nom affiché (ex: 'Mon Ollama', 'OpenAI Prod') |
| type | VARCHAR(30) | `ollama`, `vllm`, `openai`, `anthropic`, `mistral`, `google`, `openai_compatible` |
| base_url | VARCHAR(255) | nullable — URL pour providers locaux ou custom |
| api_key | TEXT | nullable, chiffré — clé API pour providers cloud |
| is_active | BOOLEAN DEFAULT true | |
| last_check_at | TIMESTAMP | nullable — dernière vérification de connectivité |
| last_check_ok | BOOLEAN | nullable — résultat de la dernière vérification |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Table `ai_models`

Modèles détectés ou ajoutés manuellement pour chaque fournisseur.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| provider_id | UUID FK ai_providers | |
| model_id | VARCHAR(255) | identifiant côté provider (ex: `mistral:7b`, `gpt-4o`, `claude-opus-4-20250514`) |
| display_name | VARCHAR(255) | nom lisible (ex: 'Mistral 7B', 'GPT-4o') |
| capabilities | JSONB | `["vision", "chat", "thinking", "embeddings"]` |
| context_window | INTEGER | nullable — taille du contexte en tokens |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

> Pas de colonne `role` ici — le rôle est assigné dans `platform_config.ai_role_*_model_id`. Un modèle peut être utilisé dans plusieurs rôles.

### Table `ai_usage_logs`

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| user_id | UUID FK users | |
| model_id | UUID FK ai_models | |
| role | VARCHAR(10) | `vl`, `instruct`, `thinking` |
| tokens_in | INTEGER | |
| tokens_out | INTEGER | |
| duration_ms | INTEGER | |
| created_at | TIMESTAMP | |

### Table `ai_categorization_history`

Apprentissage des suggestions de catégorisation comptable.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| input_label | TEXT | libellé de l'écriture |
| input_amount | DECIMAL(15,2) | montant |
| suggested_account | VARCHAR(5) FK pcg_accounts(numero) | compte suggéré par l'IA |
| final_account | VARCHAR(5) FK pcg_accounts(numero) | compte choisi par l'utilisateur |
| was_correct | BOOLEAN | `suggested == final` |
| created_at | TIMESTAMP | |

> Sert de few-shot examples pour améliorer les suggestions futures par organisation.

---

## Ajouts Docker (optionnels, manuels)

Le `docker-compose.prod.yml` de base ne contient **aucun service IA**. Le super-admin les ajoute selon ses besoins :

### LiteLLM (obligatoire si IA activée)

```yaml
litellm:
  image: ghcr.io/berriai/litellm:main-latest
  environment:
    - LITELLM_MASTER_KEY=${AI_LITELLM_MASTER_KEY}
    - DATABASE_URL=postgresql://kerpta:${DB_PASSWORD}@postgres:5432/kerpta
  networks:
    - kerpta-net
  restart: unless-stopped
  depends_on:
    - postgres
```

### Ollama (local, CPU)

```yaml
ollama:
  image: ollama/ollama
  volumes:
    - ollama_data:/root/.ollama
  networks:
    - kerpta-net
  restart: unless-stopped
```

Puis : `docker exec ollama ollama pull mistral && docker exec ollama ollama pull llava`

### vLLM (local, GPU recommandé)

```yaml
vllm:
  image: vllm/vllm-openai:latest
  command: ["--model", "PaddlePaddle/PaddleOCR-VL-1.5", "--port", "8000"]
  volumes:
    - vllm_cache:/root/.cache
  networks:
    - kerpta-net
  restart: unless-stopped
  deploy:
    resources:
      reservations:
        devices:
          - capabilities: [gpu]
```

> Pour les fournisseurs cloud (OpenAI, Anthropic, Mistral, Google), aucun conteneur supplémentaire — juste la clé API dans l'interface.

---

## API endpoints

### Super-admin (`is_platform_admin = true`)

**Fournisseurs :**

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/admin/ai/providers` | Liste les fournisseurs |
| POST | `/api/admin/ai/providers` | Ajoute un fournisseur |
| PUT | `/api/admin/ai/providers/{id}` | Modifie un fournisseur |
| DELETE | `/api/admin/ai/providers/{id}` | Supprime un fournisseur |
| POST | `/api/admin/ai/providers/{id}/test` | Teste la connectivité |
| GET | `/api/admin/ai/providers/{id}/models` | Récupère la liste des modèles depuis le fournisseur |
| POST | `/api/admin/ai/providers/{id}/sync` | Synchronise les modèles (re-détection) |

**Modèles :**

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/admin/ai/models` | Liste tous les modèles (tous fournisseurs) |
| POST | `/api/admin/ai/models` | Ajoute un modèle manuellement |
| PUT | `/api/admin/ai/models/{id}` | Modifie un modèle |
| DELETE | `/api/admin/ai/models/{id}` | Supprime un modèle |

**Rôles :**

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/admin/ai/roles` | Retourne les 3 rôles et leur modèle assigné |
| PUT | `/api/admin/ai/roles` | Assigne les modèles aux rôles (`{vl: model_id, instruct: model_id, thinking: model_id}`) |
| POST | `/api/admin/ai/roles/test` | Teste les 3 rôles avec un prompt de vérification |

**Config & Usage :**

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/admin/ai/config` | Config IA actuelle |
| PUT | `/api/admin/ai/config` | Active/désactive, LiteLLM URL/key |
| GET | `/api/admin/ai/usage` | Stats d'usage global |
| GET | `/api/admin/ai/usage/{org_id}` | Stats par organisation |

### Organisations (si IA activée)

| Méthode | Route | Rôle utilisé | Description |
|---|---|---|---|
| POST | `/api/ai/ocr` | VL | Upload image → extraction structurée |
| POST | `/api/ai/categorize` | Instruct | Libellé + montant → suggestion compte PCG |
| POST | `/api/ai/chat` | Instruct ou Thinking | Message → réponse contextuelle |
| POST | `/api/ai/generate` | Instruct | Prompt → texte généré |
| GET | `/api/ai/status` | — | Vérifie les rôles disponibles |

Le endpoint `/api/ai/chat` utilise Instruct par défaut, et bascule sur Thinking si l'utilisateur active le toggle "Réflexion approfondie" ou si la question est détectée comme complexe.

---

## Sécurité

- **Clés API chiffrées en BDD** via la même logique que les autres secrets Kerpta.
- **Données locales par défaut :** avec des providers locaux (Ollama/vLLM), aucune donnée ne quitte le serveur.
- **Logs d'usage :** chaque appel tracé dans `ai_usage_logs`.
- **Réseau interne :** Ollama, vLLM et LiteLLM sur `kerpta-net`, pas de port exposé vers l'extérieur.
- **Super-admin only :** toute la configuration infra IA est inaccessible aux organisations.

---

## Résumé des phases

| Phase | Ce qui se passe |
|---|---|
| Installation fraîche | Aucun conteneur IA. `ai_enabled = false`. Kerpta fonctionne normalement sans IA. |
| Super-admin active l'IA | Ajoute LiteLLM (+ Ollama/vLLM si local) dans le compose. Configure fournisseurs, détecte les modèles, assigne les 3 rôles. |
| Organisation utilise l'IA | Active les fonctionnalités depuis Paramètres → Modules → IA. Les utilisateurs voient "Scanner", "Suggérer", "Chat IA". |
