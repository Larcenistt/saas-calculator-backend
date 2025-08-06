import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
}

export const generateTokens = (payload: TokenPayload) => {
  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

export const verifyToken = (token: string, secret: string): TokenPayload => {
  return jwt.verify(token, secret) as TokenPayload;
};

export const generateVerificationToken = (email: string): string => {
  return jwt.sign(
    { email, type: 'email_verification' },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  );
};

export const generatePasswordResetToken = (email: string): string => {
  return jwt.sign(
    { email, type: 'password_reset' },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
};