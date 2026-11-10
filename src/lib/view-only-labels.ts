/**
 * Labels of controls that change records. Matched against the whole label, so
 * "Search", "Print", "Export", "Log out" and record names stay usable, and
 * anything about filters, grouping, columns or views is never touched.
 */
const WRITE_ACTION =
  /^(?!.*\b(?:filters?|group(?:s|ing)?|columns?|sort(?:ing)?|views?|search|favorites?)\b)(?:\+\s*)?(?:new|create|add|edit|save|update|delete|remove|archive|unarchive|restore|duplicate|import|upload|attach|post|confirm|validate|approve|reject|submit|resubmit|reset to draft|register payment|pay|reconcile|unreconcile|send|mark as \w+|mark done|lock|unlock|assign|transfer|convert|log note|schedule|schedule activity|reschedule|follow|unfollow|fold stage|unfold stage|move to \w+)(?:\s+[\w&/'-]+){0,3}$/i;
const MAX_LABEL_LENGTH = 40;

export function isWriteActionLabel(label: string): boolean {
  const text = label.replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length <= MAX_LABEL_LENGTH && WRITE_ACTION.test(text);
}
