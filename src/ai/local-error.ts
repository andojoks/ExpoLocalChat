export function localTutorErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'I hit a local tutor error: Unknown error';
  const firstFrame = error.stack?.split('\n').slice(1, 2).join('').trim();
  return `I hit a local tutor error: ${error.message}${__DEV__ && firstFrame ? `\n\n${firstFrame}` : ''}`;
}
