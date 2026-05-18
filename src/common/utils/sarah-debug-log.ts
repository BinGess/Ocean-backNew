export function sarahDebugLog(event: string, payload: Record<string, unknown>) {
  console.log(`[SarahDebug] ${event} ${JSON.stringify(payload)}`);
}
