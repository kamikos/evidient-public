export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
export function withinSentenceLimit(text: string, limit = 40): boolean {
  return text.split(/(?<=[.!?])\s+/).every(sentence => wordCount(sentence) <= limit);
}
