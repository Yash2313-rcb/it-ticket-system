import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { findNav, PHASE_NAMES } from '@/components/layout/nav-config';

export default async function ComingSoon({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const item = findNav('/' + slug.join('/'));
  if (!item) notFound();
  return (
    <>
      <PageHeader title={item.label} />
      <Card className="p-8">
        <p className="font-medium">This module is built in Phase {item.phase}: {PHASE_NAMES[item.phase]}.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The database tables, permissions and screens for {item.label} are added in that phase. Nothing here is a mock-up.
        </p>
      </Card>
    </>
  );
}
