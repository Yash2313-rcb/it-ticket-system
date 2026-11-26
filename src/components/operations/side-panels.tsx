import { Paperclip } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';
import { AttachmentDeleteButton, AttachmentUploader, CommentForm } from './thread';

export function CommentsCard({ kind, entityId, comments, names }: { kind: 'task' | 'ticket'; entityId: string; comments: any[]; names: Record<string, string> }) {
  return (
    <Card>
      <CardHeader><CardTitle>Comments ({comments.length})</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        <ul className="space-y-3">
          {comments.map((c: any) => (
            <li key={c.id} className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{names[c.author_id] ?? 'Unknown'}</span>
                <span>{formatDateTime(c.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
        <CommentForm kind={kind} entityId={entityId} />
      </CardContent>
    </Card>
  );
}

export function AttachmentsCard({ kind, entityId, path, title = 'Attachments', files, canDelete }: { kind: string; entityId: string; path?: string; title?: string; files: { id: string; file_name: string; file_size: number | null; url: string | null; uploaded_by: string | null }[]; canDelete: (uploadedBy: string | null) => boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title} ({files.length})</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {files.length === 0 && <p className="text-sm text-muted-foreground">No files attached.</p>}
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
              <a href={f.url ?? '#'} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-primary hover:underline">
                <Paperclip className="h-4 w-4 shrink-0" />
                <span className="truncate">{f.file_name}</span>
                {f.file_size ? <span className="shrink-0 text-xs text-muted-foreground">{(f.file_size / 1024).toFixed(0)} KB</span> : null}
              </a>
              {canDelete(f.uploaded_by) && <AttachmentDeleteButton id={f.id} name={f.file_name} />}
            </li>
          ))}
        </ul>
        <AttachmentUploader kind={kind} entityId={entityId} path={path} />
      </CardContent>
    </Card>
  );
}
