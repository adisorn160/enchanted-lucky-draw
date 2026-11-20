type Row<T> = { id: string; secret: string; data: T; revision: number };

export const databaseReady = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Missing database configuration');
  const response = await fetch(new URL('/rest/v1/' + path, url), {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: key,
      ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  });
  if (!response.ok) throw new Error('Database request failed: ' + response.status);
  return response.json() as Promise<T>;
}

export async function readRoom<T>(id: string) {
  const rows = await request<Row<T>[]>('enchanted_rooms?id=eq.' + encodeURIComponent(id));
  return rows[0];
}

export async function createRoom<T>(id: string, secret: string, data: T) {
  await request('enchanted_rooms', {
    method: 'POST',
    body: JSON.stringify({ id, secret, data }),
  });
}

export async function saveRoom<T>(id: string, revision: number, data: T) {
  const rows = await request<Row<T>[]>('enchanted_rooms?id=eq.' + encodeURIComponent(id) + '&revision=eq.' + revision, {
    method: 'PATCH',
    body: JSON.stringify({ revision: revision + 1, data }),
  });
  return rows.length === 1;
}
