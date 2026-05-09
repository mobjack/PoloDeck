-- Create new enum with TIMER, without OTHER
CREATE TYPE "DeviceType_new" AS ENUM ('SCOREBOARD', 'SHOT_CLOCK', 'TIMER');

-- Migrate column: map existing values (OTHER -> TIMER)
ALTER TABLE "Device" ALTER COLUMN "type" TYPE "DeviceType_new" USING (
  CASE WHEN type::text = 'OTHER' THEN 'TIMER'::"DeviceType_new"
  ELSE type::text::"DeviceType_new" END
);

DROP TYPE "DeviceType";
ALTER TYPE "DeviceType_new" RENAME TO "DeviceType";
