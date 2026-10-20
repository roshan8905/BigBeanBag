export type ApiError = {
  status?: number | string;
  data?: { error?: { code: string; message: string } };
};

export const apiErrorMessage = (error: unknown, fallback = 'Something went wrong') => {
  const candidate = error as ApiError | undefined;
  return candidate?.data?.error?.message ?? fallback;
};
