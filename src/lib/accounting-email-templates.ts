/** Pure helpers for accounting email template rendering (client/server safe). */

export function renderAccountingEmailTemplate(
  template: { subject: string; body: string },
  vars: Record<string, string>
) {
  const replace = (s: string) =>
    s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
  return { subject: replace(template.subject), body: replace(template.body) };
}
