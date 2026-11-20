type Row<T> = { id: string; secret: string; data: T; revision: number };

export const roomServiceReady = () => Boolean(
  process.env.ROOM_SERVICE_URL && process.env.ROOM_SERVICE_KEY,
);

async function request(id: string, method: string, body?: unknown) {
  const url = process.env.ROOM_SERVICE_URL;
  const key = process.env.ROOM_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing room service configuration');
  return fetch(new URL('/rooms/' + encodeURIComponent(id), url), {
    method,
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function readRoom<T>(id: string) {
  const response = await request(id, 'GET');
  if (!response.ok) throw new Error('Unable to read room');
  return response.json() as Promise<Row<T> | null>;
}

export async function createRoom<T>(id: string, secret: string, data: T) {
  const response = await request(id, 'POST', { id, secret, data, revision: 0 });
  if (!response.ok) throw new Error('Unable to create room');
}

export async function saveRoom<T>(id: string, revision: number, data: T) {
  const response = await request(id, 'PATCH', {revision, data});
  if (response.status === 409) return false;
  if (!response.ok) throw new Error('Unable to update room');
  return true;
}

export async function closeRoom(id: string, revision: number) {
  const response = await request(id, 'DELETE', {revision});
  if (response.status === 409) return false;
  if (!response.ok) throw new Error('Unable to close room');
  return true;
}
