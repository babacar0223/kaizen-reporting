-- CreateTable
CREATE TABLE "tresorerie_mouvements" (
    "id" SERIAL NOT NULL,
    "saisie_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "libelle" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tresorerie_mouvements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tresorerie_mouvements_saisie_id_idx" ON "tresorerie_mouvements"("saisie_id");

-- AddForeignKey
ALTER TABLE "tresorerie_mouvements" ADD CONSTRAINT "tresorerie_mouvements_saisie_id_fkey" FOREIGN KEY ("saisie_id") REFERENCES "tresorerie_saisies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
