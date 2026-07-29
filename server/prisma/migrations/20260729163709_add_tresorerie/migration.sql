-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tresorerie_entites_access" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "tresorerie_entites" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "pays" TEXT NOT NULL,
    "groupe" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tresorerie_entites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tresorerie_banques" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "entite_id" INTEGER NOT NULL,
    "type_compte" TEXT NOT NULL,
    "devise" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tresorerie_banques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tresorerie_devises" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT,
    "taux_xof" DECIMAL(14,6) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tresorerie_devises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tresorerie_saisies" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "banque_id" INTEGER NOT NULL,
    "devise" TEXT NOT NULL,
    "taux_xof_utilise" DECIMAL(14,6) NOT NULL,
    "position_j_moins_1" DECIMAL(18,2) NOT NULL,
    "entrees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sorties" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "position_j" DECIMAL(18,2) NOT NULL,
    "position_banque" DECIMAL(18,2) NOT NULL,
    "caisse_j_moins_1" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "caisse_j" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "commentaire" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tresorerie_saisies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tresorerie_entites_nom_key" ON "tresorerie_entites"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "tresorerie_banques_entite_id_nom_key" ON "tresorerie_banques"("entite_id", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "tresorerie_devises_code_key" ON "tresorerie_devises"("code");

-- CreateIndex
CREATE INDEX "tresorerie_saisies_date_idx" ON "tresorerie_saisies"("date");

-- CreateIndex
CREATE UNIQUE INDEX "tresorerie_saisies_date_banque_id_key" ON "tresorerie_saisies"("date", "banque_id");

-- AddForeignKey
ALTER TABLE "tresorerie_banques" ADD CONSTRAINT "tresorerie_banques_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "tresorerie_entites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tresorerie_saisies" ADD CONSTRAINT "tresorerie_saisies_banque_id_fkey" FOREIGN KEY ("banque_id") REFERENCES "tresorerie_banques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tresorerie_saisies" ADD CONSTRAINT "tresorerie_saisies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
