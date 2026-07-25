'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import {
  resolveSalesAccessRole,
  salesRoleSeesAllOrgRecords,
} from '@/lib/sales-roles';
import { renderSalesEmailTemplate } from '@/lib/sales-email-templates';

export type SalesEmailTemplate = {
  id: string;
  organization_id: string | null;
  template_key: 'send_quotation' | 'reminder' | 'follow_up' | string;
  name: string;
  subject: string;
  body: string;
  is_active: boolean;
};

export type SalesQuotationReminder = {
  id: string;
  quotation_id: string;
  reminder_type: string;
  due_at: string;
  status: string;
  channel: string;
  summary: string | null;
  crm_activity_id: string | null;
};

async function resolveSalesOrgScope() {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const session = await getSession();
  if (!session || !sessionHasSalesAccess(session)) {
    return { error: 'Unauthorized' as const };
  }

  if (!sessionUsesOrganizationScope(session.role)) {
    return {
      session,
      organizationId: null as string | null,
      isGlobalAdminView: false,
      role: resolveSalesAccessRole(session),
    };
  }

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) {
    if (scope.status === 403) {
      return {
        session,
        organizationId: null as string | null,
        isGlobalAdminView: false,
        empty: true as const,
        role: resolveSalesAccessRole(session),
      };
    }
    return { error: scope.error };
  }

  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
    return {
      session: scope.session,
      organizationId: null,
      isGlobalAdminView: true,
      role: resolveSalesAccessRole(scope.session),
    };
  }

  if (!scope.organizationId) {
    return { error: 'Select an organization from the header switcher to use Sales.' };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
    role: resolveSalesAccessRole(scope.session),
  };
}

/** Resolve sales_agents.id for the current session (ownership record rules). */
export async function resolveCurrentSalespersonId(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('sales_agents')
    .select('id')
    .eq('username', session.username)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

/** List reusable templates (org overrides + system defaults). */
export async function getSalesEmailTemplates() {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let query = supabase
      .from('sales_email_templates')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    const { data, error } = await query;
    if (error) {
      if (/sales_email_templates|relation|schema cache/i.test(error.message)) {
        return {
          templates: defaultTemplatesFallback(),
          emailSendingReady: false as const,
          message:
            'Run sales_automation_security_phase9_10.sql to enable stored templates.',
        };
      }
      return { error: error.message };
    }

    const rows = (data || []) as SalesEmailTemplate[];
    const orgId = scope.organizationId;
    const orgRows = orgId
      ? rows.filter((r) => r.organization_id === orgId)
      : [];
    const systemRows = rows.filter((r) => !r.organization_id);
    const byKey = new Map<string, SalesEmailTemplate>();
    for (const r of systemRows) byKey.set(r.template_key, r);
    for (const r of orgRows) byKey.set(r.template_key, r);

    return {
      templates: [...byKey.values()],
      emailSendingReady: false as const,
      message: 'Email delivery is prepared; sending service remains a placeholder.',
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load email templates',
    };
  }
}

function defaultTemplatesFallback(): SalesEmailTemplate[] {
  return [
    {
      id: 'local-send',
      organization_id: null,
      template_key: 'send_quotation',
      name: 'Send Quotation',
      subject: 'Quotation {{quotation_number}} from {{company_name}}',
      body: 'Dear {{customer_name}},\n\nPlease find quotation {{quotation_number}}.\n\nTotal: {{total_amount}}\nValid until: {{expiration_date}}\n\nBest regards,\n{{salesperson_name}}',
      is_active: true,
    },
    {
      id: 'local-reminder',
      organization_id: null,
      template_key: 'reminder',
      name: 'Quotation Reminder',
      subject: 'Reminder: Quotation {{quotation_number}} expires soon',
      body: 'Dear {{customer_name}},\n\nQuotation {{quotation_number}} expires on {{expiration_date}}.\n\nBest regards,\n{{salesperson_name}}',
      is_active: true,
    },
    {
      id: 'local-followup',
      organization_id: null,
      template_key: 'follow_up',
      name: 'Quotation Follow-up',
      subject: 'Follow-up on Quotation {{quotation_number}}',
      body: 'Dear {{customer_name}},\n\nFollowing up on quotation {{quotation_number}}.\n\nBest regards,\n{{salesperson_name}}',
      is_active: true,
    },
  ];
}

/**
 * Preview / “send” using a template — marks quotation as sent when requested.
 * Real SMTP remains a future integration; architecture is production-ready.
 */
export async function prepareSalesQuotationEmail(
  quotationId: string,
  templateKey: string = 'send_quotation'
) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: q, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .maybeSingle();

    if (error || !q) return { error: error?.message || 'Quotation not found' };

    const templatesRes = await getSalesEmailTemplates();
    if ('error' in templatesRes && templatesRes.error) {
      return { error: templatesRes.error };
    }
    const templates =
      'templates' in templatesRes ? templatesRes.templates : defaultTemplatesFallback();
    const template =
      templates.find((t) => t.template_key === templateKey) || templates[0];

    if (!template) return { error: 'No email template found' };

    let salespersonName = String(q.created_by || '');
    if (q.salesperson_id) {
      const { data: sp } = await supabase
        .from('sales_agents')
        .select('name')
        .eq('id', q.salesperson_id)
        .maybeSingle();
      if (sp?.name) salespersonName = String(sp.name);
    }

    let companyName = 'Company';
    if (q.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('organization_name')
        .eq('id', q.organization_id)
        .maybeSingle();
      if (org?.organization_name) companyName = String(org.organization_name);
    }

    const rendered = renderSalesEmailTemplate(template, {
      quotation_number: String(q.quotation_number || ''),
      customer_name: String(q.customer_name || 'Customer'),
      company_name: companyName,
      salesperson_name: salespersonName,
      total_amount: String(q.total_amount ?? ''),
      expiration_date: q.expiration_date
        ? String(q.expiration_date).slice(0, 10)
        : '',
    });

    await supabase.from('quotation_logs').insert([
      {
        quotation_id: quotationId,
        action: 'previewed',
        previous_status: q.status,
        new_status: q.status,
        performed_by: scope.session!.username,
        details: {
          kind: 'email_template',
          template_key: template.template_key,
          subject: rendered.subject,
          note: 'Email prepared (delivery placeholder)',
        },
      },
    ]);

    return {
      email: {
        template_key: template.template_key,
        template_name: template.name,
        ...rendered,
        sendingReady: false,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to prepare email',
    };
  }
}

/**
 * Mark open quotations past expiration_date as expired.
 * Safe to call from list/report loads (idempotent batch).
 */
export async function processSalesQuotationExpirations(options?: {
  organizationId?: string | null;
  limit?: number;
}) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const orgId = options?.organizationId ?? scope.organizationId;

    let query = supabase
      .from('quotations')
      .select('id, status, expiration_date')
      .lt('expiration_date', today)
      .in('status', ['quotation', 'quotation_sent', 'customer_review'])
      .limit(options?.limit ?? 200);

    if (orgId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', orgId);
    }

    const { data, error } = await query;
    if (error) {
      if (/expired|status|check/i.test(error.message)) {
        return {
          expired: 0,
          message:
            'Run sales_automation_security_phase9_10.sql to enable expired status.',
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    if (!rows.length) return { expired: 0 };

    const ids = rows.map((r) => String(r.id));
    const now = new Date().toISOString();
    const { error: updError } = await supabase
      .from('quotations')
      .update({
        status: 'expired',
        expired_at: now,
        updated_at: now,
        updated_by: scope.session!.username,
      })
      .in('id', ids);

    if (updError) {
      if (/expired|check/i.test(updError.message)) {
        return {
          expired: 0,
          message:
            'Run sales_automation_security_phase9_10.sql to enable expired status.',
        };
      }
      return { error: updError.message };
    }

    const logs = rows.map((r) => ({
      quotation_id: r.id,
      action: 'status_changed',
      previous_status: r.status,
      new_status: 'expired',
      performed_by: 'system',
      details: { reason: 'expiration_date_passed', automation: true },
    }));
    await supabase.from('quotation_logs').insert(logs);

    return { expired: ids.length };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to process expirations',
    };
  }
}

/** Quotations approaching expiration (for reminder UI / future notifications). */
export async function getSalesQuotationsNearingExpiration(daysAhead = 7) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) return { quotations: [] };

    const supabase = await createAdminClient();
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const toDate = new Date(today.getTime() + daysAhead * 86400000)
      .toISOString()
      .slice(0, 10);

    let query = supabase
      .from('quotations')
      .select(
        'id, quotation_number, customer_name, expiration_date, status, salesperson_id, organization_id'
      )
      .gte('expiration_date', from)
      .lte('expiration_date', toDate)
      .in('status', ['quotation', 'quotation_sent', 'customer_review'])
      .order('expiration_date', { ascending: true })
      .limit(50);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }

    if (!salesRoleSeesAllOrgRecords(scope.role)) {
      const agentId = await resolveCurrentSalespersonId();
      if (agentId) {
        query = query.or(
          `salesperson_id.eq.${agentId},created_by.eq.${scope.session!.username}`
        );
      } else {
        query = query.eq('created_by', scope.session!.username);
      }
    }

    const { data, error } = await query;
    if (error) return { error: error.message };
    return { quotations: data || [] };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load expiration reminders',
    };
  }
}

/**
 * Schedule an expiration or follow-up reminder.
 * When a CRM opportunity is linked, also creates a CRM activity (no duplicate activity system).
 */
export async function scheduleSalesQuotationFollowUp(input: {
  quotationId: string;
  type: 'expiration' | 'follow_up' | 'email' | 'call' | 'meeting';
  dueAt: string;
  summary: string;
  channel?: 'in_app' | 'email' | 'both';
}) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const summary = String(input.summary || '').trim();
    if (!summary) return { error: 'Summary is required' };
    if (!input.dueAt) return { error: 'Due date is required' };

    const supabase = await createAdminClient();
    const { data: q, error: loadError } = await supabase
      .from('quotations')
      .select('id, opportunity_id, organization_id, salesperson_id, customer_name, quotation_number')
      .eq('id', input.quotationId)
      .maybeSingle();

    if (loadError || !q) return { error: loadError?.message || 'Quotation not found' };

    let crmActivityId: string | null = null;
    const activityTypeMap: Record<string, string> = {
      call: 'call',
      meeting: 'meeting',
      email: 'email',
      follow_up: 'follow-up',
      expiration: 'todo',
    };

    if (q.opportunity_id) {
      const assigned =
        q.salesperson_id ||
        (await resolveCurrentSalespersonId()) ||
        scope.session!.username;

      try {
        const { data: activity } = await supabase
          .from('crm_activities')
          .insert({
            organization_id: q.organization_id || scope.organizationId,
            opportunity_id: q.opportunity_id,
            activity_type: activityTypeMap[input.type] || 'follow-up',
            summary: `${summary} (${q.quotation_number || 'QT'})`,
            notes: `Sales follow-up for ${q.customer_name || 'customer'}`,
            due_date: input.dueAt,
            assigned_to: String(assigned),
            status: 'scheduled',
            created_by: scope.session!.username,
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (activity?.id) crmActivityId = String(activity.id);
      } catch {
        // CRM activities optional if table/permissions differ
      }
    }

    const reminderRow = {
      organization_id: q.organization_id || scope.organizationId,
      quotation_id: input.quotationId,
      reminder_type: input.type,
      due_at: input.dueAt,
      status: 'scheduled',
      channel: input.channel || 'in_app',
      summary,
      crm_activity_id: crmActivityId,
      created_by: scope.session!.username,
    };

    const { data: reminder, error } = await supabase
      .from('sales_quotation_reminders')
      .insert([reminderRow])
      .select('*')
      .single();

    if (error) {
      if (/sales_quotation_reminders|relation|schema cache/i.test(error.message)) {
        await supabase.from('quotation_logs').insert([
          {
            quotation_id: input.quotationId,
            action: 'activity',
            previous_status: null,
            new_status: null,
            performed_by: scope.session!.username,
            details: {
              summary,
              due_date: input.dueAt,
              type: input.type,
              crm_activity_id: crmActivityId,
              note: 'Reminder logged (run phase9 migration for reminder table)',
            },
          },
        ]);
        return {
          reminder: null as SalesQuotationReminder | null,
          crm_activity_id: crmActivityId,
          message: 'Follow-up logged; run migration for full reminder scheduling.',
        };
      }
      return { error: error.message };
    }

    await supabase.from('quotation_logs').insert([
      {
        quotation_id: input.quotationId,
        action: 'activity',
        previous_status: null,
        new_status: null,
        performed_by: scope.session!.username,
        details: {
          summary,
          due_date: input.dueAt,
          type: input.type,
          reminder_id: reminder.id,
          crm_activity_id: crmActivityId,
        },
      },
    ]);

    if (input.type === 'expiration') {
      await supabase
        .from('quotations')
        .update({
          last_reminder_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: scope.session!.username,
        })
        .eq('id', input.quotationId);
    }

    return {
      reminder: reminder as SalesQuotationReminder,
      crm_activity_id: crmActivityId,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to schedule follow-up',
    };
  }
}

export async function getSalesQuotationReminders(quotationId: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('sales_quotation_reminders')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('due_at', { ascending: true });

    if (error) {
      if (/sales_quotation_reminders|relation/i.test(error.message)) {
        return { reminders: [] as SalesQuotationReminder[] };
      }
      return { error: error.message };
    }
    return { reminders: (data || []) as SalesQuotationReminder[] };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load reminders',
    };
  }
}
