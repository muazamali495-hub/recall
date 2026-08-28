"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type RevokeResult = { ok: true } | { ok: false; error: string };

/**
 * Unlinks one of your own devices.
 *
 * Goes through revoke_own_device rather than a plain delete so the removal is
 * written to the security log. A device vanishing with no record of who removed
 * it or when is the gap this exists to close — and the database scopes the
 * delete to the caller, so passing somebody else's id removes nothing.
 */
export async function revokeDevice(deviceId: string): Promise<RevokeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  if (!/^[0-9a-f-]{36}$/i.test(deviceId)) return { ok: false, error: "Unknown device." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_own_device", { p_device_id: deviceId });

  if (error) return { ok: false, error: "Could not remove that device." };
  if (data !== true) return { ok: false, error: "That device is already gone." };

  revalidatePath("/connect");
  return { ok: true };
}
