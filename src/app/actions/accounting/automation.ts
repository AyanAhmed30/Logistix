'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { requireAccountingActionAccess } from '@/lib/accounting-page-access';
import { getAccountingInvoiceDetail } from '@/app/actions/accounting/invoices';
import { formatMoney } from '@/lib/sales-quotation-form';
import { renderAccountingEmailTemplate } from '@/lib/accounting-email-templates';

export type AccountingEmailTemplateKey =
  | 'invoice_sent'
  | 'payment_reminder'
  | 'overdue_reminder'
  | 'credit_note'
  | 'refund';

export type AccountingEmailTemplate = {
  id: string;
  organization_id: string | null;
  template_key: AccountingEmailTemplateKey | string;
  name: string;
  subject: string;
  body: string;
  is_active: boolean;
};

export type AccountingActivity = {
  id: string;
  invoice_id: string | null;
  contact_id: string | null;
  activity_type: string;
  summary: string;
  status: string;
  due_at: string;
  assigned_to: string | null;
  created_by: string | null;
};

export type AccountingReminder = {
  id: string;
  invoice_id: string;
  reminder_type: string;
  status: string;
  due_at: string;
  sent_at: string | null;
  summary: string | null;
};

async function resolveScope(opts?: { automation?: boolean }) {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const gate = await requireAccountingActionAccess(
    opts?.automation ? { automation: true } : undefined
  );
  if ('error' in gate) return { error: gate.error };

  const session = gate.session!;
  if (!sessionUsesOrganizationScope(session.role)) {
    return { session, organizationId: null as string | null, isGlobalAdminView: false };
  }

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) {
    if (scope.status === 403) {
      return {
        session,
        organizationId: null as string | null,
        isGlobalAdminView: false,
        empty: true as const,
      };
    }
    return { error: scope.error };
  }

  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
    return { session: scope.session, organizationId: null, isGlobalAdminView: true };
  }
  if (!scope.organizationId) {
    return { error: 'Select an organization from the header switcher.' };
  }
  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

export async function writeAccountingAuditLog(opts: {
  organizationId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  performedBy?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  details?: Record<string, unknown>;
}) {
  try {
    const supabase = await createAdminClient();
    await supabase.from('accounting_audit_logs').insert([
      {
        organization_id: opts.organizationId || null,
        entity_type: opts.entityType,
        entity_id: opts.entityId || null,
        action: opts.action,
        performed_by: opts.performedBy || null,
        previous_value: opts.previousValue ?? null,
        new_value: opts.newValue ?? null,
        details: opts.details ?? null,
      },
    ]);
  } catch {
    // Soft-fail — never block business operations
  }
}

const FALLBACK_TEMPLATES: Omit<AccountingEmailTemplate, 'id'>[] = [
  {
    organization_id: null,
    template_key: 'invoice_sent',
    name: 'Invoice Sent',
    subject: 'Invoice {{invoice_number}} from {{company_name}}',
    body: 'Dear {{customer_name}},\n\nPlease find invoice {{invoice_number}} for {{total_amount}}.\nDue date: {{due_date}}.\n\nThank you,\n{{company_name}}',
    is_active: true,
  },
  {
    organization_id: null,
    template_key: 'payment_reminder',
    name: 'Payment Reminder',
    subject: 'Payment reminder for invoice {{invoice_number}}',
    body: 'Dear {{customer_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{outstanding_amount}} is due on {{due_date}}.\n\nThank you,\n{{company_name}}',
    is_active: true,
  },
  {
    organization_id: null,
    template_key: 'overdue_reminder',
    name: 'Overdue Reminder',
    subject: 'Overdue invoice {{invoice_number}}',
    body: 'Dear {{customer_name}},\n\nInvoice {{invoice_number}} for {{outstanding_amount}} is overdue (due {{due_date}}).\nPlease arrange payment at your earliest convenience.\n\nThank you,\n{{company_name}}',
    is_active: true,
  },
  {
    organization_id: null,
    template_key: 'credit_note',
    name: 'Credit Note',
    subject: 'Credit note {{credit_note_number}} from {{company_name}}',
    body: 'Dear {{customer_name}},\n\nPlease find credit note {{credit_note_number}} referencing invoice {{invoice_number}} for {{total_amount}}.\n\nThank you,\n{{company_name}}',
    is_active: true,
  },
  {
    organization_id: null,
    template_key: 'refund',
    name: 'Refund Notification',
    subject: 'Refund processed for {{invoice_number}}',
    body: 'Dear {{customer_name}},\n\nA refund of {{refund_amount}} has been processed for invoice {{invoice_number}}.\n\nThank you,\n{{company_name}}',
    is_active: true,
  },
];

export async function getAccountingEmailTemplates() {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_email_templates')
      .select('*')
      .eq('is_active', true)
      .order('template_key');

    if (error) {
      if (/accounting_email_templates|relation/i.test(error.message)) {
        return {
          templates: FALLBACK_TEMPLATES.map((t, i) => ({
            ...t,
            id: `fallback-${i}`,
          })),
        };
      }
      return { error: error.message };
    }

    const rows = (data || []) as AccountingEmailTemplate[];
    const orgId = scope.organizationId;
    const preferred = new Map<string, AccountingEmailTemplate>();
    for (const t of FALLBACK_TEMPLATES) {
      preferred.set(t.template_key, { ...t, id: `fallback-${t.template_key}` });
    }
    for (const t of rows) {
      if (!t.organization_id) preferred.set(t.template_key, t);
    }
    for (const t of rows) {
      if (orgId && t.organization_id === orgId) preferred.set(t.template_key, t);
    }

    return { templates: [...preferred.values()] };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load templates',
    };
  }
}

export async function prepareAccountingTemplateEmail(opts: {
  templateKey: AccountingEmailTemplateKey;
  invoiceId?: string;
  extraVars?: Record<string, string>;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const templatesRes = await getAccountingEmailTemplates();
    if ('error' in templatesRes && templatesRes.error) return { error: templatesRes.error };
    const template = (templatesRes.templates || []).find(
      (t) => t.template_key === opts.templateKey
    );
    if (!template) return { error: 'Template not found' };

    const vars: Record<string, string> = {
      company_name: 'Logistix',
      customer_name: '',
      invoice_number: '',
      due_date: '',
      total_amount: '',
      outstanding_amount: '',
      credit_note_number: '',
      refund_amount: '',
      ...(opts.extraVars || {}),
    };

    if (opts.invoiceId) {
      const detail = await getAccountingInvoiceDetail(opts.invoiceId);
      if ('error' in detail && detail.error) return { error: detail.error };
      const inv = detail.invoice!;
      vars.customer_name = inv.customer_name;
      vars.invoice_number = inv.invoice_number;
      vars.due_date = inv.due_date || '';
      vars.total_amount = formatMoney(inv.total_amount);
      vars.outstanding_amount = formatMoney(inv.amount_residual);
      vars.company_name = inv.organization_name || vars.company_name;

      const rendered = renderAccountingEmailTemplate(template, vars);
      return {
        subject: rendered.subject,
        body: rendered.body,
        to: inv.email || '',
        sendingReady: false as const,
        templateKey: opts.templateKey,
      };
    }

    const rendered = renderAccountingEmailTemplate(template, vars);
    return {
      subject: rendered.subject,
      body: rendered.body,
      to: '',
      sendingReady: false as const,
      templateKey: opts.templateKey,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to prepare email',
    };
  }
}

export async function scheduleAccountingReminder(opts: {
  invoiceId: string;
  reminderType: 'payment' | 'overdue';
  dueAt?: string;
  sendNow?: boolean;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const detail = await getAccountingInvoiceDetail(opts.invoiceId);
    if ('error' in detail && detail.error) return { error: detail.error };
    const inv = detail.invoice!;
    if (inv.amount_residual <= 0.004) {
      return { error: 'Invoice has no outstanding balance' };
    }
    if (opts.reminderType === 'overdue') {
      const today = new Date().toISOString().slice(0, 10);
      if (!inv.due_date || inv.due_date >= today) {
        return { error: 'Invoice is not overdue' };
      }
    }

    const orgId = inv.organization_id || scope.organizationId;
    if (!orgId) return { error: 'Organization is required' };

    const supabase = await createAdminClient();

    // Duplicate guard: recent sent of same type
    const { data: recent } = await supabase
      .from('accounting_reminders')
      .select('id, status, sent_at, created_at')
      .eq('invoice_id', opts.invoiceId)
      .eq('reminder_type', opts.reminderType)
      .in('status', ['scheduled', 'sent'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent && String(recent.status) === 'scheduled' && !opts.sendNow) {
      return { error: 'A reminder is already scheduled for this invoice' };
    }
    if (recent && String(recent.status) === 'sent' && opts.sendNow) {
      const sentAt = recent.sent_at ? new Date(String(recent.sent_at)).getTime() : 0;
      if (Date.now() - sentAt < 12 * 60 * 60 * 1000) {
        return { error: 'A reminder was already sent recently for this invoice' };
      }
    }

    const dueAt = opts.dueAt || new Date().toISOString();
    const status = opts.sendNow ? 'sent' : 'scheduled';

    const { data: row, error } = await supabase
      .from('accounting_reminders')
      .insert([
        {
          organization_id: orgId,
          invoice_id: opts.invoiceId,
          contact_id: inv.contact_id,
          reminder_type: opts.reminderType,
          channel: 'email',
          status,
          due_at: dueAt,
          sent_at: opts.sendNow ? new Date().toISOString() : null,
          summary: `${opts.reminderType} reminder for ${inv.invoice_number}`,
          template_key:
            opts.reminderType === 'overdue' ? 'overdue_reminder' : 'payment_reminder',
          created_by: scope.session!.username,
        },
      ])
      .select('id')
      .single();

    if (error) {
      if (/accounting_reminders|relation|duplicate|unique/i.test(error.message)) {
        return {
          error:
            /duplicate|unique/i.test(error.message)
              ? 'A reminder is already scheduled'
              : 'Run create_accounting_reporting_automation_phase8_9.sql to enable reminders.',
        };
      }
      return { error: error.message };
    }

    await supabase.from('accounting_invoice_logs').insert([
      {
        invoice_id: opts.invoiceId,
        action: opts.sendNow ? 'reminder_sent' : 'reminder_scheduled',
        performed_by: scope.session!.username,
        details: {
          reminder_id: row?.id,
          reminder_type: opts.reminderType,
        },
      },
    ]);

    await writeAccountingAuditLog({
      organizationId: orgId,
      entityType: 'invoice',
      entityId: opts.invoiceId,
      action: opts.sendNow ? 'reminder_sent' : 'reminder_scheduled',
      performedBy: scope.session!.username,
      details: { reminder_type: opts.reminderType },
    });

    // Prepare email for UI (delivery placeholder)
    const email = await prepareAccountingTemplateEmail({
      templateKey:
        opts.reminderType === 'overdue' ? 'overdue_reminder' : 'payment_reminder',
      invoiceId: opts.invoiceId,
    });

    return { reminderId: row?.id ? String(row.id) : null, email };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to schedule reminder',
    };
  }
}

export async function getAccountingRemindersForInvoice(invoiceId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_reminders')
      .select('id, invoice_id, reminder_type, status, due_at, sent_at, summary')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false });
    if (error) {
      if (/accounting_reminders|relation/i.test(error.message)) {
        return { reminders: [] as AccountingReminder[] };
      }
      return { error: error.message };
    }
    return {
      reminders: (data || []).map((r) => ({
        id: String(r.id),
        invoice_id: String(r.invoice_id),
        reminder_type: String(r.reminder_type),
        status: String(r.status),
        due_at: String(r.due_at),
        sent_at: r.sent_at ? String(r.sent_at) : null,
        summary: r.summary ? String(r.summary) : null,
      })),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load reminders',
    };
  }
}

export async function createAccountingActivity(opts: {
  invoiceId?: string;
  contactId?: string;
  activityType: 'follow_up' | 'call' | 'send_reminder' | 'verify_payment' | 'todo';
  summary: string;
  dueAt: string;
  assignedTo?: string;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    let orgId = scope.organizationId;
    let contactId = opts.contactId || null;
    if (opts.invoiceId) {
      const detail = await getAccountingInvoiceDetail(opts.invoiceId);
      if ('error' in detail && detail.error) return { error: detail.error };
      orgId = detail.invoice!.organization_id || orgId;
      contactId = detail.invoice!.contact_id || contactId;
    }
    if (!orgId) return { error: 'Organization is required' };
    if (!opts.invoiceId && !contactId) {
      return { error: 'Invoice or customer is required' };
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_activities')
      .insert([
        {
          organization_id: orgId,
          invoice_id: opts.invoiceId || null,
          contact_id: contactId,
          activity_type: opts.activityType,
          summary: opts.summary.trim() || opts.activityType,
          status: 'scheduled',
          due_at: opts.dueAt,
          assigned_to: opts.assignedTo || scope.session!.username,
          created_by: scope.session!.username,
        },
      ])
      .select('id')
      .single();

    if (error) {
      if (/accounting_activities|relation/i.test(error.message)) {
        return {
          error:
            'Run create_accounting_reporting_automation_phase8_9.sql to enable activities.',
        };
      }
      return { error: error.message };
    }

    if (opts.invoiceId) {
      await supabase.from('accounting_invoice_logs').insert([
        {
          invoice_id: opts.invoiceId,
          action: 'activity_scheduled',
          performed_by: scope.session!.username,
          details: {
            activity_id: data?.id,
            activity_type: opts.activityType,
            due_at: opts.dueAt,
          },
        },
      ]);
    }

    await writeAccountingAuditLog({
      organizationId: orgId,
      entityType: opts.invoiceId ? 'invoice' : 'customer',
      entityId: opts.invoiceId || contactId,
      action: 'activity_scheduled',
      performedBy: scope.session!.username,
      details: { activity_type: opts.activityType },
    });

    return { activityId: data?.id ? String(data.id) : null };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create activity',
    };
  }
}

export async function getAccountingActivities(opts: {
  invoiceId?: string;
  contactId?: string;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_activities')
      .select(
        'id, invoice_id, contact_id, activity_type, summary, status, due_at, assigned_to, created_by'
      )
      .order('due_at', { ascending: true });
    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }
    if (opts.invoiceId) q = q.eq('invoice_id', opts.invoiceId);
    if (opts.contactId) q = q.eq('contact_id', opts.contactId);

    const { data, error } = await q.limit(100);
    if (error) {
      if (/accounting_activities|relation/i.test(error.message)) {
        return { activities: [] as AccountingActivity[] };
      }
      return { error: error.message };
    }
    return {
      activities: (data || []).map((a) => ({
        id: String(a.id),
        invoice_id: a.invoice_id ? String(a.invoice_id) : null,
        contact_id: a.contact_id ? String(a.contact_id) : null,
        activity_type: String(a.activity_type),
        summary: String(a.summary || ''),
        status: String(a.status),
        due_at: String(a.due_at),
        assigned_to: a.assigned_to ? String(a.assigned_to) : null,
        created_by: a.created_by ? String(a.created_by) : null,
      })),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load activities',
    };
  }
}

export async function markAccountingActivityDone(activityId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('accounting_activities')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', activityId);
    if (error) return { error: error.message };
    return { ok: true as const };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update activity',
    };
  }
}

export async function getAccountingAuditLogs(filters: {
  page?: number;
  pageSize?: number;
  search?: string;
} = {}) {
  try {
    let organizationId: string | null = null;
    let isGlobalAdminView = false;

    const gate = await requireAccountingActionAccess({ reports: true });
    if ('error' in gate) return { error: gate.error };

    const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
      '@/lib/admin-organization-context'
    );
    if (sessionUsesOrganizationScope(gate.session!.role)) {
      const scope = await requireAdminOrganizationScope();
      if (!('error' in scope)) {
        const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
        if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
          isGlobalAdminView = true;
        } else {
          organizationId = scope.organizationId;
        }
      }
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(50, Math.max(10, filters.pageSize || 30));
    let q = supabase
      .from('accounting_audit_logs')
      .select('*', { count: 'exact' })
      .order('performed_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (organizationId && !isGlobalAdminView) {
      q = q.eq('organization_id', organizationId);
    }
    if (filters.search?.trim()) {
      const like = `%${filters.search.trim()}%`;
      q = q.or(`action.ilike.${like},performed_by.ilike.${like},entity_type.ilike.${like}`);
    }

    const { data, error, count } = await q;
    if (error) {
      if (/accounting_audit_logs|relation/i.test(error.message)) {
        return { logs: [], total: 0, page, pageSize };
      }
      return { error: error.message };
    }
    return {
      logs: (data || []).map((r) => ({
        id: String(r.id),
        organization_id: r.organization_id ? String(r.organization_id) : null,
        entity_type: String(r.entity_type || ''),
        entity_id: r.entity_id ? String(r.entity_id) : null,
        action: String(r.action || ''),
        performed_by: r.performed_by ? String(r.performed_by) : null,
        previous_value: r.previous_value,
        new_value: r.new_value,
        details: r.details,
        performed_at: String(r.performed_at || ''),
      })),
      total: count ?? 0,
      page,
      pageSize,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load audit logs',
    };
  }
}
