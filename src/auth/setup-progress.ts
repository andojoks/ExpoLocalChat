export const SETUP_STEP_TOTAL = 4;

export type SetupProgress = {
  step: number;
  total: number;
  label: string;
};

/** Friendly copy shown under the welcome-style brand block. */
export const SETUP_STEPS = {
  storage: {
    step: 1,
    total: SETUP_STEP_TOTAL,
    label: 'Getting things ready',
  },
  secure: {
    step: 2,
    total: SETUP_STEP_TOTAL,
    label: 'Setting up device security',
  },
  session: {
    step: 3,
    total: SETUP_STEP_TOTAL,
    label: 'Looking for your account',
  },
  finish: {
    step: 4,
    total: SETUP_STEP_TOTAL,
    label: 'Wrapping up',
  },
} as const satisfies Record<string, SetupProgress>;
