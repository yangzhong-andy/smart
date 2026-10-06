#!/usr/bin/env bash
set -Eeuo pipefail

set -a
. /etc/smart-erp/baxi.env
set +a
cd /srv/smart-erp/baxi/current

auth_secret="${NEXTAUTH_SECRET:-${JWT_SECRET:-}}"
user_id="$(node -e '
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  prisma.user.findFirst({ where: { isActive: true }, select: { id: true } })
    .then((user) => {
      if (!user) process.exit(2);
      process.stdout.write(user.id);
    })
    .finally(() => prisma.$disconnect());
')"
token="$(INTERNAL_AUTH_SECRET="${auth_secret}" INTERNAL_USER_ID="${user_id}" node -e '
  const jwt = require("jsonwebtoken");
  process.stdout.write(jwt.sign(
    { userId: process.env.INTERNAL_USER_ID },
    process.env.INTERNAL_AUTH_SECRET,
    { algorithm: "HS256", expiresIn: 120 },
  ));
')"

payload="$(curl --fail --silent --show-error \
  -H "Authorization: Bearer ${token}" \
  'http://127.0.0.1:3001/api/shopee/fulfillment?pageSize=1&stage=shipping')"
echo "${payload}" | jq '{total, returned: (.data | length), stageCounts, shops: (.shops | length)}'

shop_id="$(echo "${payload}" | jq -r '.data[0].shopId // empty')"
order_sn="$(echo "${payload}" | jq -r '.data[0].orderSn // empty')"
package_number="$(echo "${payload}" | jq -r '.data[0].packages[0].packageNumber // empty')"
test -n "${shop_id}"
test -n "${order_sn}"

tracking="$(curl --fail --silent --show-error --get \
  -H "Authorization: Bearer ${token}" \
  --data-urlencode "shopId=${shop_id}" \
  --data-urlencode "orderSn=${order_sn}" \
  --data-urlencode "packageNumber=${package_number}" \
  'http://127.0.0.1:3001/api/shopee/fulfillment/tracking')"
echo "${tracking}" | jq '{logisticsStatus, timelineCount: (.timeline | length), hasError: has("error")}'
