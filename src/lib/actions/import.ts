'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { getImportSpec } from '@/lib/import/spec';
import { runImport, type ImportResult } from '@/lib/import/run';

/** Step 1 ("check") validates the file and changes nothing. Step 2 ("import") saves the valid rows. */
export async function importFile(key: string, mode: 'check' | 'import', fd: FormData): Promise<ImportResult> {
  const me = await getSessionProfile();
  const spec = getImportSpec(key);
  if (!me || !me.is_active || !spec || !spec.roles.includes(me.role)) return { error: 'You do not have permission to import here.', mode };
  const file = fd.get('file');
  if (!(file instanceof File)) return { error: 'Choose a CSV or Excel file first.', mode };

  const supabase = await createClient();
  const result = await runImport(spec, { id: me.id, role: me.role }, file, mode === 'import' ? 'import' : 'check', supabase);
  if (mode === 'import' && result.imported) revalidatePath('/', 'layout');
  return result;
}
