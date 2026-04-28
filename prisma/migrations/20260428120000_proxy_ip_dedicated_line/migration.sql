-- CreateTable
CREATE TABLE "ProxyIpDedicatedLine" (
    "proxyId" INTEGER NOT NULL,
    "dedicatedLineString" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyIpDedicatedLine_pkey" PRIMARY KEY ("proxyId")
);
