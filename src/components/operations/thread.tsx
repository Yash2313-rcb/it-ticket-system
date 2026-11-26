'use client';

import { useActionState, useEffect, useRef, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/form';
import { addComment, deleteAttachment, uploadAttachment, type ActionState } from '@/lib/actions/operations';

export function CommentForm({ kind, entityId }: { kind: 'task' | 'ticket'; entityId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addComment, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entity_id" value={entityId} />
      <Textarea name="body" placeholder="Add a comment or update" aria-label="Comment" required />
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending}>{pending ? 'Posting...' : 'Post comment'}</Button>
    </form>
  );
}

export function AttachmentUploader({ kind, entityId, path }: { kind: string; entityId: string; path?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadAttachment, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entity_id" value={entityId} />
      <input type="hidden" name="path" value={path ?? `/operations/${kind}s/${entityId}`} />
      <Input name="file" type="file" aria-label="File to attach" required className="h-auto py-1.5" />
      <p className="text-xs text-muted-foreground">PDF, images, Office files, CSV, TXT or ZIP. Up to 10 MB.</p>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? 'Uploading...' : 'Upload file'}</Button>
    </form>
  );
}

export function AttachmentDeleteButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button" disabled={pending} aria-label={`Remove ${name}`}
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
      onClick={() => {
        if (!confirm(`Remove ${name}?`)) return;
        start(async () => { const r = await deleteAttachment(id); if (r.error) alert(r.error); });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
