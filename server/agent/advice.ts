export function hasBannedWords(text: string): boolean {
  return /\b(?:close|closely|careful|carefully|regular)\s+monitor\w*|\bmonitor(?:ing)?\s+(?:of\s+)?patients\b|\b(?:avoid|caution)\b|\b(?:directions?|instructions?)\s+to\b|\b(safe|should|must|recommend\w*|advis\w*|verified)\b|\b(?:ok|okay|fine)\s+to\b|\bwait\s+\d+\s+(?:hours?|days?)\b|\btake\s+(?:twice|double|half|\d)|(?:^|[.!?]\s+)(?:take|avoid|stop|wait|drink|do not|don't)\b|\bit is\s+(?:safe|fine|ok)\b/i.test(text.trim());
}
export function claimContainsAdvice(text: string): boolean {
  return !/^The label\b/i.test(text.trim()) && hasBannedWords(text);
}
