import "dotenv/config";
import { syncYytAdvertising } from "../src/lib/yyt-advertising-sync";
import { prisma } from "../src/lib/prisma";

const daysIndex = process.argv.indexOf("--days");
const days = daysIndex >= 0 ? Number(process.argv[daysIndex + 1]) : 2;

syncYytAdvertising({ days })
  .then((result) => {
    console.log(JSON.stringify(result));
    if (!result.success) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
