export const PASSWORD_MIN_LENGTH = 5;

export type PasswordStrengthLevel =
  | 'empty'
  | 'very_weak'
  | 'weak'
  | 'medium'
  | 'strong'
  | 'very_strong';

export type PasswordStrength = {
  level: PasswordStrengthLevel;
  label: string;
  /** 0–4 filled segments for the heat bar */
  score: number;
  color: string;
};

const LABELS: Record<Exclude<PasswordStrengthLevel, 'empty'>, string> = {
  very_weak: 'Very weak',
  weak: 'Weak',
  medium: 'Medium',
  strong: 'Strong',
  very_strong: 'Very strong',
};

const COLORS: Record<Exclude<PasswordStrengthLevel, 'empty'>, string> = {
  very_weak: '#E11D48',
  weak: '#F97316',
  medium: '#EAB308',
  strong: '#84CC16',
  very_strong: '#16A34A',
};

/** Score password for UI meter. Min length 5 required before rising above very_weak. */
export function scorePassword(password: string): PasswordStrength {
  if (!password) {
    return { level: 'empty', label: '', score: 0, color: '#CBD5E1' };
  }

  let points = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) points += 1;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^A-Za-z0-9]/.test(password)) points += 1;

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      level: 'very_weak',
      label: LABELS.very_weak,
      score: 1,
      color: COLORS.very_weak,
    };
  }

  if (points <= 2) {
    return { level: 'weak', label: LABELS.weak, score: 2, color: COLORS.weak };
  }
  if (points === 3) {
    return { level: 'medium', label: LABELS.medium, score: 3, color: COLORS.medium };
  }
  if (points === 4) {
    return { level: 'strong', label: LABELS.strong, score: 4, color: COLORS.strong };
  }
  return {
    level: 'very_strong',
    label: LABELS.very_strong,
    score: 4,
    color: COLORS.very_strong,
  };
}

export function isPasswordLongEnough(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}
