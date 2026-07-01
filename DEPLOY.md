# Guide de déploiement — Railway (Backend) + Vercel (Frontend)

> **Durée estimée :** 45–60 minutes (première fois)

---

## Vue d'ensemble

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Vercel             │        │  Railway                  │
│  (Frontend React)   │──────▶ │  (Express API + PostgreSQL│
│  URL publique HTTPS │  API   │  URL publique HTTPS)      │
└─────────────────────┘        └──────────────────────────┘
```

---

## ÉTAPE 1 — Préparer le dépôt GitHub

Le déploiement Railway et Vercel se font depuis GitHub.

### 1.1 Initialiser le dépôt

Ouvrir un terminal dans `C:\Users\pc\OneDrive - Kaizen Business Support\Applications\Application Reporting\`

```bash
git init
git add .
git commit -m "Initial commit — Kaizen Reporting App"
```

### 1.2 Créer un `.gitignore` à la racine

Créer le fichier `.gitignore` :
```
node_modules/
dist/
.env
*.local
.DS_Store
```

### 1.3 Pousser sur GitHub

```bash
# Sur GitHub.com : créer un nouveau repo privé "kaizen-reporting"
git remote add origin https://github.com/TON_USERNAME/kaizen-reporting.git
git branch -M main
git push -u origin main
```

---

## ÉTAPE 2 — Déployer le Backend sur Railway

### 2.1 Créer le projet Railway

1. Aller sur **railway.app** → Se connecter avec GitHub
2. **New Project** → **Deploy from GitHub repo**
3. Sélectionner `kaizen-reporting`
4. Railway détecte automatiquement le monorepo → sélectionner le dossier **`server/`** quand demandé
   - Root Directory : `server`

### 2.2 Ajouter PostgreSQL

Dans le projet Railway :
1. **+ Add Service** → **Database** → **PostgreSQL**
2. Railway crée automatiquement la variable `DATABASE_URL` et la partage avec le service API

### 2.3 Configurer les variables d'environnement

Dans Railway, service API → onglet **Variables** → ajouter :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | *(générer une clé aléatoire forte — voir ci-dessous)* |
| `JWT_EXPIRES_IN` | `8h` |
| `CORS_ORIGIN` | *(ajouter après avoir obtenu l'URL Vercel — étape 3)* |
| `TAUX_CFA_EUR` | `655.957` |

> **Générer une clé JWT forte** (dans Git Bash / terminal) :
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

> **`DATABASE_URL`** est déjà injectée automatiquement par le service PostgreSQL — ne pas la toucher.

### 2.4 Exporter et importer les données locales

Si vous avez déjà des données en local qu'il faut transférer :

```bash
# 1. Exporter la base locale (dans Git Bash)
pg_dump -h localhost -p 5433 -U postgres -d kaizen_reporting -F c -f kaizen_reporting_backup.dump

# 2. Récupérer les infos de connexion Railway
# Dans Railway → service PostgreSQL → Connect → affiche host, port, user, password, dbname

# 3. Importer sur Railway
pg_restore -h HOST_RAILWAY -p PORT_RAILWAY -U USER_RAILWAY -d DB_RAILWAY -F c kaizen_reporting_backup.dump
```

> **Alternative plus simple :** utiliser **TablePlus** ou **DBeaver** avec les credentials Railway pour importer le dump.

### 2.5 Vérifier le déploiement

Railway construit et démarre automatiquement :
- Build : `npm ci && npx prisma generate && npm run build`
- Start : `npx prisma migrate deploy && node dist/index.js`

Tester : `https://VOTRE_API.up.railway.app/health` → doit retourner `{ "status": "ok" }`

---

## ÉTAPE 3 — Déployer le Frontend sur Vercel

### 3.1 Créer le projet Vercel

1. Aller sur **vercel.com** → Se connecter avec GitHub
2. **Add New Project** → Sélectionner `kaizen-reporting`
3. **Root Directory** : `client`
4. **Framework Preset** : Vite (auto-détecté)
5. **Build Command** : `npm run build` (par défaut)
6. **Output Directory** : `dist` (par défaut)

### 3.2 Configurer les variables d'environnement

Dans Vercel → Settings → Environment Variables :

| Variable | Valeur |
|---|---|
| `VITE_API_URL` | `https://VOTRE_API.up.railway.app/api` |

> Remplacer `VOTRE_API` par l'URL réelle de Railway (dashboard Railway → Settings → Domains).

### 3.3 Déployer

Cliquer **Deploy** → Vercel build et publie.

URL finale : `https://kaizen-reporting.vercel.app` (ou personnalisable)

---

## ÉTAPE 4 — Connecter les deux services (CORS)

Maintenant que Vercel a une URL, retourner sur Railway :

Variable `CORS_ORIGIN` → mettre l'URL Vercel :
```
https://kaizen-reporting.vercel.app
```

Railway redéploie automatiquement. Le frontend peut maintenant appeler l'API.

---

## ÉTAPE 5 — Créer les comptes utilisateurs

1. Se connecter avec le compte Super Admin :
   - Email : `admin@kaizen-bs.com`
   - Mot de passe : `Admin@2026!`

   > ⚠️ **Changer ce mot de passe immédiatement** après le premier accès.

2. Aller dans **Paramètres → Utilisateurs** → créer les comptes pour le département Reporting :
   - Rôle : `VIEWER` (lecture seule)
   - Accès BU selon le périmètre de chaque utilisateur

---

## Récapitulatif des URLs

| Service | URL | Type |
|---|---|---|
| Frontend | `https://kaizen-reporting.vercel.app` | Vercel (gratuit) |
| API Backend | `https://kaizen-api.up.railway.app` | Railway (~5 €/mois) |
| Base de données | Géré par Railway | Railway (inclus) |

---

## Mises à jour futures

Chaque `git push` sur la branche `main` redéploie automatiquement :
- Railway rebuild le backend
- Vercel rebuild le frontend

Aucune action manuelle nécessaire.

---

## Dépannage fréquent

| Problème | Solution |
|---|---|
| CORS bloqué | Vérifier `CORS_ORIGIN` sur Railway = URL exacte Vercel (sans slash final) |
| Page blanche sur `/dashboard` | `vercel.json` doit être présent dans `client/` (déjà créé) |
| API timeout | Railway free tier : le service dort après 30 min d'inactivité. Upgrader au plan Starter |
| `DATABASE_URL` manquante | Vérifier que le service PostgreSQL Railway est lié au service API |
| Migrations non appliquées | Dans Railway → service API → terminal : `npx prisma migrate deploy` |
