type RoomRecord = { id: string; secret: string; data: unknown; revision: number };
type RoomNamespace = { getByName(name: string): { fetch(request: Request): Promise<Response> } };
type Env = { ROOMS: RoomNamespace; ROOM_SERVICE_KEY: string };
const roomPath = /^\/rooms\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const ROOM_LIFETIME = 8 * 60 * 60 * 1000;

export class TemporaryRoom {
  private room?: RoomRecord;
  private expiresAt = 0;

  async fetch(request: Request) {
    if (this.room && Date.now() >= this.expiresAt) this.room = undefined;
    if (request.method === 'GET') return Response.json(this.room ?? null);
    if (request.method === 'POST') {
      const record = await request.json() as RoomRecord;
      if (this.room) return new Response(null, {status:409});
      this.room = record;
      this.expiresAt = Date.now() + ROOM_LIFETIME;
      return new Response(null, {status:201});
    }
    if (request.method === 'PATCH' || request.method === 'DELETE') {
      const move = await request.json() as { revision: number; data?: unknown };
      if (!this.room || move.revision !== this.room.revision) return new Response(null, {status:409});
      if (request.method === 'DELETE') this.room = undefined;
      else this.room = {...this.room, revision: move.revision + 1, data: move.data};
      return new Response(null, {status:204});
    }
    return new Response(null, {status:405});
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const room = roomPath.exec(new URL(request.url).pathname);
    if (!room) return new Response(null, {status:404});
    if (!env.ROOM_SERVICE_KEY || request.headers.get('authorization') !== 'Bearer ' + env.ROOM_SERVICE_KEY) {
      return new Response(null, {status:403});
    }
    return env.ROOMS.getByName(room[1]).fetch(request);
  },
};
