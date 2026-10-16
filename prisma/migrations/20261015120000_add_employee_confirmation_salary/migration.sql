-- Additive only: preserve all personnel, payroll and financial records.
ALTER TABLE "Employee"
  ADD COLUMN "probationStartDate" DATE,
  ADD COLUMN "expectedConfirmationDate" DATE,
  ADD COLUMN "confirmationDate" DATE,
  ADD COLUMN "probationBaseSalary" DOUBLE PRECISION,
  ADD COLUMN "probationPositionSalary" DOUBLE PRECISION,
  ADD COLUMN "probationFullAttendanceBonus" DOUBLE PRECISION;

ALTER TABLE "Payroll" ADD COLUMN "salarySnapshot" JSONB;
