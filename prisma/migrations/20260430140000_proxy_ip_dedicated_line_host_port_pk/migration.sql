-- 改为主键 (proxyHost, proxyPort)，避免万子 proxy_id 超出 JS 安全整数后保存与列表合并不一致
DROP TABLE IF EXISTS "ProxyIpDedicatedLine";

CREATE TABLE "ProxyIpDedicatedLine" (
    "proxyHost" TEXT NOT NULL,
    "proxyPort" INTEGER NOT NULL,
    "dedicatedLineString" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyIpDedicatedLine_pkey" PRIMARY KEY ("proxyHost", "proxyPort")
);
