import { notFound } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import { PrintButton } from '@/components/forms/confirm-button';

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const me = await requireProfile();
  const { id } = await params;
  const { type } = await searchParams;
  const isReturn = type === 'return';
  const supabase = await createClient();
  const [{ data: r }, { data: org }] = await Promise.all([
    supabase.from('asset_assignments').select('id, assigned_on, returned_on, return_condition, notes, assets(asset_code, name, brand, model_number, serial_number, condition), employees(emp_code, full_name, designation, departments(name)), departments(name)').eq('id', id).maybeSingle(),
    supabase.from('system_settings').select('value').eq('key', 'organization_name').single(),
  ]);
  if (!r || (isReturn && !r.returned_on)) notFound();
  const a: any = r.assets;
  const e: any = r.employees;
  const rd: any = r.departments;

  return (
    <div className="mx-auto max-w-2xl rounded-lg border bg-white p-8 text-black print:border-0">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <h1 className="text-center text-xl font-bold">{(org?.value as string) ?? 'IT Department'}</h1>
      <h2 className="mb-6 text-center text-lg font-semibold">{isReturn ? 'Asset Return Receipt' : 'Asset Handover Receipt'}</h2>
      <table className="mb-6 w-full text-sm">
        <tbody>
          {[
            ['Date', formatDate(isReturn ? r.returned_on : r.assigned_on)],
            ['Asset ID', a?.asset_code], ['Asset', a?.name], ['Brand / model', [a?.brand, a?.model_number].filter(Boolean).join(' ') || '-'], ['Serial number', a?.serial_number ?? '-'],
            ['Condition', isReturn ? r.return_condition ?? a?.condition : a?.condition],
            ['Employee', `${e?.full_name} (${e?.emp_code})`], ['Designation', e?.designation ?? '-'], ['Department', rd?.name ?? e?.departments?.name ?? '-'],
            ...(r.notes ? [['Notes', r.notes]] : []),
          ].map(([k, v]) => (<tr key={k as string} className="border-b"><td className="w-40 py-2 font-medium">{k}</td><td className="py-2">{v}</td></tr>))}
        </tbody>
      </table>
      <p className="mb-10 text-sm">{isReturn ? 'The above asset has been returned to the IT department in the condition stated.' : 'I acknowledge receipt of the above asset in working condition and will use it only for company purposes. I will return it on request or when I leave the organization.'}</p>
      <div className="grid grid-cols-2 gap-8 text-sm">
        <div><div className="h-12 border-b" /><div className="mt-1">{isReturn ? 'Returned by (employee)' : 'Received by (employee)'}</div></div>
        <div><div className="h-12 border-b" /><div className="mt-1">{isReturn ? 'Received by (IT department)' : 'Issued by (IT department)'}</div></div>
      </div>
      <p className="mt-6 text-xs text-gray-500">Generated {new Date().toLocaleDateString('en-IN')} by {me.full_name}.</p>
    </div>
  );
}
