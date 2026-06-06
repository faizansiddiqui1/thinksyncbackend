import User from "../models/user_models/User.js";

export const DEFAULT_SUPER_ADMIN_EMAIL = "thinksyncspace@gmail.com";

export async function ensureSuperAdminUser() {
  const email = String(
    process.env.SUPER_ADMIN_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL,
  )
    .trim()
    .toLowerCase();

  const result = await User.updateOne(
    { email },
    {
      $set: {
        role: "super_admin",
        isActive: true,
      },
      $setOnInsert: {
        email,
      },
    },
    {
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  return {
    email,
    created: result.upsertedCount > 0,
  };
}
