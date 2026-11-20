// Shared better-auth configuration
// Each app creates its own auth instance using these shared settings

export const authConfig = {
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    autoSignIn: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update every 24h
    cookieName: 'foodai_session',
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min client-side cache
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string' as const,
        required: false,
        defaultValue: 'CUSTOMER',
        input: false, // Not user-settable on registration
      },
      phone: {
        type: 'string' as const,
        required: false,
      },
      whatsappPhone: {
        type: 'string' as const,
        required: false,
      },
    },
  },
  rateLimit: {
    window: 60, // 60 seconds
    max: 10, // 10 auth requests per minute
  },
};

export type AuthSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    emailVerified: boolean;
    phone?: string | null;
    whatsappPhone?: string | null;
    image?: string | null;
  };
  session: {
    id: string;
    token: string;
    expiresAt: Date;
  };
};

export type AuthUser = AuthSession['user'];
