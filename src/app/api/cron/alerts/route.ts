import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Optional daily job (e.g. Vercel Cron: path /api/cron/alerts, schedule "30 2 * * *").
 * Set CRON_SECRET in the environment; Vercel sends it as "Authorization: Bearer <secret>".
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new NextResponse('Unauthorized', { status: 401 });
  const { data, error } = await createAdminClient().rpc('generate_alerts');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ created: data });
}
