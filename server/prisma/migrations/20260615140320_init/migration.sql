-- CreateTable
CREATE TABLE "dim_bu" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "nom_court" TEXT NOT NULL,
    "couleur_ui" TEXT NOT NULL,

    CONSTRAINT "dim_bu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dim_entites" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "nom_court" TEXT NOT NULL,
    "bu_id" INTEGER NOT NULL,
    "devise_source" TEXT NOT NULL DEFAULT 'EUR',
    "taux_conversion" DECIMAL(12,6) NOT NULL DEFAULT 1,
    "ratio_bu" DECIMAL(8,6),
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dim_entites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dim_clients" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "entite_id" INTEGER NOT NULL,
    "bu" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "dim_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dim_sous_clients" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "client_id" INTEGER NOT NULL,
    "entite_id" INTEGER NOT NULL,

    CONSTRAINT "dim_sous_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dim_lignes_pl" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre_affichage" INTEGER NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "dim_lignes_pl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fait_pl" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "annee" INTEGER NOT NULL,
    "mois" INTEGER NOT NULL,
    "entite_id" INTEGER NOT NULL,
    "bu" TEXT NOT NULL,
    "ligne_pl_id" INTEGER NOT NULL,
    "type_valeur" TEXT NOT NULL,
    "type_periode" TEXT NOT NULL,
    "montant" DECIMAL(15,2) NOT NULL,
    "source_onglet" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fait_pl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fait_revenus_clients" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "annee" INTEGER NOT NULL,
    "mois" INTEGER NOT NULL,
    "entite_id" INTEGER NOT NULL,
    "bu" TEXT NOT NULL,
    "client_id" INTEGER,
    "sous_client_id" INTEGER,
    "client_nom" TEXT NOT NULL,
    "sous_client_nom" TEXT,
    "ligne_pl" TEXT NOT NULL,
    "type_valeur" TEXT NOT NULL,
    "montant" DECIMAL(15,2) NOT NULL,
    "margin_rate" DECIMAL(8,6),
    "share_pct" DECIMAL(8,6),
    "source_onglet" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fait_revenus_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "bu_access" TEXT[],
    "entites_access" INTEGER[],
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "table_name" TEXT,
    "entite_id" INTEGER,
    "periode" TEXT,
    "details" JSONB,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dim_bu_nom_key" ON "dim_bu"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "dim_bu_nom_court_key" ON "dim_bu"("nom_court");

-- CreateIndex
CREATE UNIQUE INDEX "dim_entites_nom_court_key" ON "dim_entites"("nom_court");

-- CreateIndex
CREATE UNIQUE INDEX "dim_lignes_pl_nom_key" ON "dim_lignes_pl"("nom");

-- CreateIndex
CREATE INDEX "fait_pl_annee_mois_bu_idx" ON "fait_pl"("annee", "mois", "bu");

-- CreateIndex
CREATE INDEX "fait_pl_entite_id_annee_idx" ON "fait_pl"("entite_id", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "fait_pl_date_entite_id_ligne_pl_id_type_valeur_type_periode_key" ON "fait_pl"("date", "entite_id", "ligne_pl_id", "type_valeur", "type_periode");

-- CreateIndex
CREATE INDEX "fait_revenus_clients_annee_mois_bu_entite_id_idx" ON "fait_revenus_clients"("annee", "mois", "bu", "entite_id");

-- CreateIndex
CREATE INDEX "fait_revenus_clients_entite_id_client_nom_annee_idx" ON "fait_revenus_clients"("entite_id", "client_nom", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_ts_idx" ON "audit_logs"("user_id", "ts");

-- CreateIndex
CREATE INDEX "audit_logs_table_name_ts_idx" ON "audit_logs"("table_name", "ts");

-- AddForeignKey
ALTER TABLE "dim_entites" ADD CONSTRAINT "dim_entites_bu_id_fkey" FOREIGN KEY ("bu_id") REFERENCES "dim_bu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dim_clients" ADD CONSTRAINT "dim_clients_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "dim_entites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dim_sous_clients" ADD CONSTRAINT "dim_sous_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "dim_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait_pl" ADD CONSTRAINT "fait_pl_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "dim_entites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait_pl" ADD CONSTRAINT "fait_pl_ligne_pl_id_fkey" FOREIGN KEY ("ligne_pl_id") REFERENCES "dim_lignes_pl"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait_revenus_clients" ADD CONSTRAINT "fait_revenus_clients_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "dim_entites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait_revenus_clients" ADD CONSTRAINT "fait_revenus_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "dim_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait_revenus_clients" ADD CONSTRAINT "fait_revenus_clients_sous_client_id_fkey" FOREIGN KEY ("sous_client_id") REFERENCES "dim_sous_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
