import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { isAdmin } from '@/lib/permissions';
import { REPORTS } from '@/lib/reports';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ReportsPage() {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const groups = [...new Set(REPORTS.map((r) => r.group))].sort();
  return (
    <>
      <PageHeader title="Reports and analytics" description="Every report is built from live records and can be downloaded as PDF, Excel or CSV, or printed." />
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g} id={g.startsWith('F.') ? 'financial' : undefined}>
            <CardHeader><CardTitle>{g}</CardTitle></CardHeader>
            <ul className="divide-y text-sm">
              {REPORTS.filter((r) => r.group === g).map((r) => (
                <li key={r.key}><Link href={`/reports/${r.key}`} className="block px-5 py-3 hover:bg-muted/50"><div className="font-medium">{r.title}</div><div className="text-xs text-muted-foreground">{r.description}</div></Link></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
