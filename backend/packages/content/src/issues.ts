export interface ContentIssue {
  itemId: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  ok: boolean;
  issues: ContentIssue[];
}

export function report(issues: ContentIssue[]): ValidationReport {
  return { ok: !issues.some((i) => i.severity === 'error'), issues };
}
