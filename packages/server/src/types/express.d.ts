declare global {
  namespace Express {
    interface User {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    }
  }
}

export {};
