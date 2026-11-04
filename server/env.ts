// Keep this module inside server imports. Never expose these through EXPO_PUBLIC_*.
export function getEnv() {
  return {
    modelApiKey: process.env.MODEL_API_KEY?.trim() || undefined,
  };
}

// Production requires an explicit opt-in; local development defaults to on.
export function liveRunsEnabled() {
  return (process.env.LIVE_RUNS ?? (process.env.NODE_ENV === 'production' ? 'off' : 'on')) === 'on';
}
