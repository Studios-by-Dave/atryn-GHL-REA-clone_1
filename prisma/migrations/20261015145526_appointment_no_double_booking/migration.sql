-- Double-booking prevention (GiST exclusion) — not expressible in Prisma schema.
-- Requires btree_gist for UUID equality inside an EXCLUDE constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_no_double_booking"
  EXCLUDE USING gist (
    "subAccountId" WITH =,
    "hostUserId"   WITH =,
    tstzrange("startAt", "endAt") WITH &&
  )
  WHERE (
    "status" IN ('SCHEDULED', 'CONFIRMED')
    AND "hostUserId" IS NOT NULL
  );
