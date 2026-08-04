-- AlterTable: 万子 proxy_id 可能超出 INTEGER，改为 BIGINT
ALTER TABLE "ProxyIpDedicatedLine" ALTER COLUMN "proxyId" TYPE BIGINT USING "proxyId"::bigint;
