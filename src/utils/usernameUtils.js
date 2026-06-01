export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

export const USERNAME_HELP =
  "Username must be 3-20 characters and use only lowercase letters, numbers, periods, or underscores. Start and end with a letter or number.";

export function normalizeUsername(username, { required = false } = {}) {
  if (username === undefined || username === null) {
    if (required) throw new Error("Username is required");
    return null;
  }

  const normalized = String(username).trim();

  if (!normalized) {
    if (required) throw new Error("Username is required");
    return null;
  }

  if (normalized !== normalized.toLowerCase()) {
    throw new Error("Username must use lowercase letters only");
  }

  if (
    normalized.length < USERNAME_MIN_LENGTH ||
    normalized.length > USERNAME_MAX_LENGTH
  ) {
    throw new Error(
      `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters`,
    );
  }

  if (!/^[a-z0-9._]+$/.test(normalized)) {
    throw new Error(USERNAME_HELP);
  }

  if (!/^[a-z0-9].*[a-z0-9]$/.test(normalized)) {
    throw new Error("Username must start and end with a letter or number");
  }

  if (/[._]{2}/.test(normalized)) {
    throw new Error("Username cannot contain consecutive periods or underscores");
  }

  return normalized;
}
