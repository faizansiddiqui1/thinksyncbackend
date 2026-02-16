export const isNewDevice = (user, ip, userAgent) => {
  return !user.refreshTokens.some(
    (s) => s.ip === ip && s.userAgent === userAgent
  );
};

