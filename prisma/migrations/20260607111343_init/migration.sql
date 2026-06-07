-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('REDDIT', 'DISCORD');

-- CreateEnum
CREATE TYPE "OppStatus" AS ENUM ('NEW', 'TRIAGED', 'DRAFTED', 'APPROVED', 'POSTED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "signals" TEXT[],
    "intentScore" INTEGER,
    "persona" TEXT,
    "pain" TEXT,
    "status" "OppStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "variantA" TEXT NOT NULL,
    "variantB" TEXT NOT NULL,
    "includesLink" BOOLEAN NOT NULL DEFAULT true,
    "utmCampaign" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostedReply" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "finalText" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utmCampaign" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PostedReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attribution" (
    "id" TEXT NOT NULL,
    "postedReplyId" TEXT NOT NULL,
    "signups" INTEGER NOT NULL DEFAULT 0,
    "trials" INTEGER NOT NULL DEFAULT 0,
    "paidUsers" INTEGER NOT NULL DEFAULT 0,
    "mrrCents" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountActivity" (
    "id" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "postsWithLink" INTEGER NOT NULL DEFAULT 0,
    "postsHelpful" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccountActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_type_name_key" ON "Source"("type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_externalId_key" ON "Opportunity"("externalId");

-- CreateIndex
CREATE INDEX "Opportunity_status_intentScore_idx" ON "Opportunity"("status", "intentScore");

-- CreateIndex
CREATE INDEX "Opportunity_sourceId_idx" ON "Opportunity"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_opportunityId_key" ON "Draft"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "PostedReply_opportunityId_key" ON "PostedReply"("opportunityId");

-- CreateIndex
CREATE INDEX "PostedReply_utmCampaign_idx" ON "PostedReply"("utmCampaign");

-- CreateIndex
CREATE UNIQUE INDEX "Attribution_postedReplyId_key" ON "Attribution"("postedReplyId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountActivity_accountName_date_key" ON "AccountActivity"("accountName", "date");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostedReply" ADD CONSTRAINT "PostedReply_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_postedReplyId_fkey" FOREIGN KEY ("postedReplyId") REFERENCES "PostedReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
