'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button, buttonClass } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { importFile } from '@/lib/actions/import';
import type { ImportResult } from '@/lib/import/run';

export function ImportDialog({ importKey, title }: { importKey: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const router = useRouter();

  const close = () => { setOpen(false); setFile(null); setResult(null); };
  const send = (mode: 'check' | 'import') => {
    if (!file) { setResult({ error: 'Choose a CSV or Excel file first.' }); return; }
    const fd = new FormData();
    fd.set('file', file);
    start(async () => {
      const r = await importFile(importKey, mode, fd);
      setResult(r);
      if (mode === 'import' && r.imported) {
        toast(`${r.imported.toLocaleString('en-IN')} ${title.toLowerCase()} imported${r.errors?.length ? `, ${r.errors.length + (r.moreErrors ?? 0)} skipped` : ''}.`);
        router.refresh();
      }
    });
  };

  const checked = result?.mode === 'check' && result.ok;
  const done = result?.mode === 'import' && !!result.imported;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Upload className="h-4 w-4" /> Import</Button>
      <Modal open={open} onClose={close} title={`Import ${title.toLowerCase()} from CSV or Excel`} wide>
        <div className="space-y-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Download the template and fill in one row per record (keep the first row).</li>
            <li>Choose your file and press <b className="text-foreground">Check file</b>. Nothing is saved yet.</li>
            <li>If the summary looks right, press <b className="text-foreground">Import</b>. Rows with problems are skipped and listed.</li>
          </ol>

          {importKey === 'assets' && <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">Your existing IT assets register (Sr no, Asset ID, Name of Item, Item Description, Item Serial Number, Location, User, Received Date ...) can be uploaded as it is. The columns are matched automatically and a summary is shown after Check file.</p>}

          <div className="flex flex-wrap gap-2">
            <a href={`/data/template?key=${importKey}&format=xlsx`} className={buttonClass('outline', 'sm')}><Download className="h-4 w-4" /> Excel template</a>
            <a href={`/data/template?key=${importKey}&format=csv`} className={buttonClass('outline', 'sm')}><Download className="h-4 w-4" /> CSV template</a>
          </div>

          <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors hover:border-primary hover:bg-muted/40"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setResult(null); } }}>
            <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
            <span className="font-medium">{file ? file.name : 'Click to choose a file, or drop it here'}</span>
            <span className="text-xs text-muted-foreground">{file ? `${(file.size / 1024).toFixed(0)} KB` : '.xlsx or .csv, up to 2,000 rows and 5 MB'}</span>
          </button>
          <input ref={input} type="file" accept=".csv,.xlsx,.xls,.xlsm,.tsv,text/csv" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />

          {result?.error && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{result.error}</p>
          )}
          {result && !result.error && result.total !== undefined && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-success" />
                {done ? `${result.imported} of ${result.total} rows imported.` : `${result.valid} of ${result.total} rows are ready to import.`}
              </p>
              {result.matched && result.matched.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Columns used: {result.matched.join(', ')}.</p>}
              {result.ignored && result.ignored.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Columns ignored (not recognised): {result.ignored.join(', ')}.</p>}
              {!!result.notes?.length && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {result.notes.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              )}
            </div>
          )}
          {!!result?.errors?.length && (
            <div className="max-h-52 overflow-auto rounded-md border">
              <p className="sticky top-0 border-b bg-muted px-3 py-1.5 text-xs font-semibold">Rows that need attention (row numbers match your sheet)</p>
              <ul className="divide-y text-xs">
                {result.errors.map((e, i) => <li key={i} className="px-3 py-1.5"><b>Row {e.row}:</b> {e.message}</li>)}
              </ul>
              {!!result.moreErrors && <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">…and {result.moreErrors} more.</p>}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>{done ? 'Close' : 'Cancel'}</Button>
            {!done && <Button variant="outline" disabled={pending || !file} onClick={() => send('check')}>{pending && !checked ? 'Checking...' : 'Check file'}</Button>}
            {!done && <Button disabled={pending || !file || !checked || !result?.valid} onClick={() => send('import')}>{pending && checked ? 'Importing...' : `Import ${result?.valid ?? ''} rows`.trim()}</Button>}
          </div>
        </div>
      </Modal>
    </>
  );
}
