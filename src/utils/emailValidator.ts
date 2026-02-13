export const isAllowedEmailDomain = (email: string): boolean => {
  const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS?.split(',') || [];
  
  if (allowedDomains.length === 0) {
    return true; // If no domains specified, allow all
  }

  const emailDomain = email.split('@')[1]?.toLowerCase();
  
  return allowedDomains.some(domain => {
    const trimmedDomain = domain.trim().toLowerCase();
    return emailDomain === trimmedDomain || emailDomain?.endsWith(`.${trimmedDomain}`);
  });
};

export const getAllowedDomains = (): string[] => {
  return process.env.ALLOWED_EMAIL_DOMAINS?.split(',').map(d => d.trim()) || [];
};
