-- CreateTable
CREATE TABLE "dim_client_groupes" (
    "id" SERIAL NOT NULL,
    "entite_id" INTEGER NOT NULL,
    "client_nom" TEXT NOT NULL,
    "groupe" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dim_client_groupes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dim_client_groupes_entite_id_client_nom_key" ON "dim_client_groupes"("entite_id", "client_nom");
