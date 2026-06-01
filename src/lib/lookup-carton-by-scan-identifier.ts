import type { createAdminClient } from "@/utils/supabase/server";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;

/** scan_token → carton_serial_number → sticker_identifier (USB numeric barcodes). */
export async function lookupCartonByScanIdentifier(
  supabase: SupabaseAdmin,
  trimmed: string,
  select: string
): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }> {
  const toRow = (row: unknown): Record<string, unknown> => row as Record<string, unknown>;

  const byToken = await supabase.from("cartons").select(select).eq("scan_token", trimmed).maybeSingle();
  if (!byToken.error && byToken.data) {
    return { data: toRow(byToken.data), error: null };
  }

  const bySerial = await supabase
    .from("cartons")
    .select(select)
    .eq("carton_serial_number", trimmed)
    .maybeSingle();
  if (!bySerial.error && bySerial.data) {
    return { data: toRow(bySerial.data), error: null };
  }

  const bySticker = await supabase
    .from("cartons")
    .select(select)
    .eq("sticker_identifier", trimmed)
    .maybeSingle();
  if (!bySticker.error && bySticker.data) {
    return { data: toRow(bySticker.data), error: null };
  }

  return {
    data: null,
    error: bySticker.error ?? bySerial.error ?? byToken.error ?? { message: "Carton not found" },
  };
}
