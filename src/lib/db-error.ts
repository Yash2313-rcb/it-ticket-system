const DENIED = 'You do not have permission to do this.';

export function friendlyDbError(msg: string): string {
  if (msg.includes('duplicate key')) return 'A record with the same unique value (code, serial number, invoice or IP) already exists.';
  if (msg.includes('foreign key')) return 'This record is linked to other records and cannot be changed this way.';
  if (msg.includes('row-level security')) return DENIED;
  return msg.replace(/^.*?ERROR:\s*/, '');
}
